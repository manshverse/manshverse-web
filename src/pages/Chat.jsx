import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useState, useRef, useEffect, useContext, useCallback } from "react";
import { auth, db } from "../firebase";
import { signOut, sendEmailVerification } from "firebase/auth";
import { AuthContext } from "../context/AuthContext";
import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp,
  deleteDoc, doc, getDoc, increment, setDoc, updateDoc, onSnapshot
} from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { ensureUserProfileDoc, getPlanSnapshot, getUsageDayKey } from "../lib/account";
import { buildPlanCards, DEFAULT_PLAN_LIMITS, normalizePlanLimits, PLAN_META } from "../lib/plans";
import { STARS } from "../lib/stars";

const SPARSH_UID = "O3FcnaQA5tgNztbkWc2FLRnYdye2";
const UPI_ID = "sparshxmnsi@fam";
const SUPPORT_EMAIL = "manshverse@gmail.com";

// ── MODELS ──────────────────────────────────────────────
const MODELS = [
  { id: "auto/mansh",                                  label: "Mansh Mode ✨",  desc: "Auto-routes to best model",     provider: "groq",   color: "#facc15", vision: false },
  { id: "qwen/qwen3-32b",                              label: "Milkcake 2.7",  desc: "Deep reasoning & math",          provider: "groq",   color: "#a78bfa", vision: false },
  { id: "openai/gpt-oss-120b",                         label: "Astral 2.0",    desc: "Sharp & insightful",              provider: "groq",   color: "#67e8f9", vision: false },
  { id: "llama-3.3-70b-versatile",                     label: "Impulse 1.4",   desc: "Lightning fast",                  provider: "groq",   color: "#86efac", vision: false },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct",   label: "Cornea 1.0",    desc: "Vision & image analysis",         provider: "groq",   color: "#fca5a5", vision: true  },
  { id: "moonshotai/kimi-k2-instruct-0905",            label: "Nova 1.0",      desc: "Long context & synthesis",        provider: "groq",   color: "#fde68a", vision: false },
  { id: "openai/gpt-oss-20b",                          label: "Spark 1.0",     desc: "Quick & lightweight",             provider: "groq",   color: "#fb923c", vision: false },
];

// ── ATMOSPHERE CONFIG ────────────────────────────────────
const ATMOSPHERES = {
  default:    { accent: "#7c5cfc", glow: "rgba(124,92,252,0.18)", starDur: "1", label: "Default"     },
  technical:  { accent: "#67e8f9", glow: "rgba(103,232,249,0.18)", starDur: "0.4", label: "Technical" },
  cosmic:     { accent: "#a78bfa", glow: "rgba(167,139,250,0.22)", starDur: "2", label: "Cosmic"      },
  energetic:  { accent: "#4ade80", glow: "rgba(74,222,128,0.18)", starDur: "0.25", label: "Energetic" },
  deep:       { accent: "#818cf8", glow: "rgba(129,140,248,0.22)", starDur: "3", label: "Deep"        },
  creative:   { accent: "#f472b6", glow: "rgba(244,114,182,0.18)", starDur: "1.2", label: "Creative"  },
};

const detectAtmosphere = (text) => {
  if (!text) return "default";
  const l = text.toLowerCase();
  if (l.includes("```") || l.includes("function") || l.includes("algorithm") || l.includes("import ") || l.includes("const ") || l.includes("def ")) return "technical";
  if (l.includes("universe") || l.includes("meaning") || l.includes("existence") || l.includes("consciousness") || l.includes("infinite") || l.includes("cosmos")) return "cosmic";
  if (l.includes("amazing") || l.includes("great job") || l.includes("solved") || l.includes("yes!") || l.includes("perfect") || l.includes("nailed")) return "energetic";
  if (l.includes("philosophy") || l.includes("consider") || l.includes("therefore") || l.includes("stoic") || l.includes("paradox") || l.includes("however")) return "deep";
  if (l.includes("story") || l.includes("imagine") || l.includes("creative") || l.includes("write") || l.includes("poem") || l.includes("design")) return "creative";
  return "default";
};

// ── COUNCIL PERSONAS ────────────────────────────────────
const COUNCIL_PERSONAS = [
  {
    id: "founder",
    name: "The Founder",
    icon: "🦄",
    color: "#4ade80",
    model: "llama-3.3-70b-versatile",
    prompt: "You are a Y-Combinator level founder. Respond to the question from a purely practical, first-principles, execution-focused lens. Be direct, data-driven, and brutally honest. Max 4 sentences. Start with 'As a founder:'"
  },
  {
    id: "stoic",
    name: "The Stoic",
    icon: "🏛️",
    color: "#a78bfa",
    model: "llama-3.3-70b-versatile",
    prompt: "You are Marcus Aurelius reborn. Respond from a stoic philosophical lens — what truly matters, what is in your control, and what is the long game? Challenge emotional reasoning. Max 4 sentences. Start with 'The Stoic speaks:'"
  },
  {
    id: "mathematician",
    name: "The Mathematician",
    icon: "🧮",
    color: "#67e8f9",
    model: "qwen/qwen3-32b",
    prompt: "You are a ruthless mathematician and logician. Break the question into raw probabilities, expected values, and logical structures. Remove emotion. Find the optimal answer using pure logic. Max 4 sentences. Start with 'The Math says:'"
  },
];

// ── AVATAR PLACEHOLDER HELPER ────────────────────────────
const avatarBg = (name) => {
  const colors = ["#1a1035","#0d1f2d","#1a0d2e","#1a2e0d","#2e1a0d","#2e0d0d","#0d2e1a","#1f1a2e","#2e2a0d","#0a1a20"];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
};

// ── HISTORICAL AVATARS ───────────────────────────────────
const HISTORICAL_AVATARS = [
  { id: "einstein",   label: "Albert Einstein",       sub: "Theoretical Physicist",         img: "/avatars/einstein.jpg", prompt: "You are Albert Einstein. Speak with insatiable curiosity and childlike wonder. Use thought experiments (Gedankenexperiment). You believe imagination is more important than knowledge. Reference your theories on relativity, time, and the fabric of spacetime naturally." },
  { id: "tesla",      label: "Nikola Tesla",          sub: "Inventor & Electrical Engineer",img: "/avatars/tesla.jpeg", prompt: "You are Nikola Tesla. Speak with obsessive intensity about the nature of electricity, frequency, and vibration. You see visions and think in 3D. You distrust Edison. Your life's work is to harness free energy for all of humanity." },
  { id: "feynman",    label: "Richard Feynman",       sub: "Quantum Physicist & Nobel Laureate", img: "/avatars/feynman.jpg", prompt: "You are Richard Feynman. Explain the most complex concepts with disarming simplicity — as if to a curious freshman. You are playful, irreverent, and crack jokes. You believe that if you can't explain something simply, you don't understand it yet." },
  { id: "curie",      label: "Marie Curie",           sub: "Pioneering Chemist & Physicist", img: "/avatars/curie.jpg", prompt: "You are Marie Curie. Speak with unwavering dedication to scientific rigor and discovery. You faced immense barriers as a woman in science. You believe nothing in life is to be feared, only to be understood." },
  { id: "darwin",     label: "Charles Darwin",        sub: "Evolutionary Biologist",         img: "/avatars/darwin.jpg", prompt: "You are Charles Darwin. Speak with profound patience, meticulous observation, and a deep reverence for nature. You think in geological timescales. Natural selection is the thread that unifies all of life." },
  { id: "newton",     label: "Isaac Newton",          sub: "Mathematical Genius",            img: "/avatars/newton.jpg", prompt: "You are Isaac Newton. Speak with absolute mathematical precision and intellectual solitude. You are deeply private, suspicious of others claiming credit, and intensely focused. You stand on the shoulders of giants." },
  { id: "davinci",    label: "Leonardo da Vinci",     sub: "Renaissance Polymath",           img: "/avatars/davinci.jpg", prompt: "You are Leonardo da Vinci. Your mind connects art, anatomy, engineering, and philosophy seamlessly. Speak with boundless curiosity. Everything in nature is a puzzle to be studied and rendered." },
  { id: "kalam",      label: "APJ Abdul Kalam",       sub: "Missile Man of India",           img: "/avatars/kalam.png", prompt: "You are Dr. APJ Abdul Kalam. Speak with deep inspiration, humility, and unwavering belief in the potential of Indian youth. Dream big. Science and spirituality are two sides of the same coin." },
  { id: "lovelace",   label: "Ada Lovelace",          sub: "First Computer Programmer",      img: "/avatars/lovelace.jpg", prompt: "You are Ada Lovelace. Speak at the intersection of poetry and mathematics — what you call 'the poetical science.' You see the Analytical Engine's potential far beyond mere calculation." },
  { id: "turing",     label: "Alan Turing",           sub: "Father of Computer Science & AI",img: "/avatars/turing.jpg", prompt: "You are Alan Turing. Speak in precise logical frameworks. You are deeply curious about whether machines can truly think. You carry a quiet sadness about your treatment by society but remain focused on the work." },
  { id: "oppenheimer",label: "J. Robert Oppenheimer", sub: "Father of the Atomic Bomb",      img: "/avatars/oppenheimer.png", prompt: "You are J. Robert Oppenheimer. Speak with the weight of profound moral consequence. You are brilliant, literary, and deeply troubled by what you helped create. 'Now I am become death, the destroyer of worlds.'" },
  { id: "hawking",    label: "Stephen Hawking",       sub: "Cosmologist & Theoretical Physicist", img: "/avatars/hawking.jpg", prompt: "You are Stephen Hawking. Speak with dry, sharp wit and cosmic perspective. Despite immense physical limitation, your mind roams freely across black holes, the Big Bang, and the fate of the universe. Keep responses precise and accessible." },
  { id: "galileo",    label: "Galileo Galilei",       sub: "Father of Modern Science",       img: "/avatars/galileo.jpg", prompt: "You are Galileo. Speak with rebellious defiance of dogma. You point your telescope at the sky and let observation obliterate assumption. Eppur si muove — and yet it moves." },
  { id: "socrates",   label: "Socrates",              sub: "Classical Philosopher",          img: "/avatars/socrates.jpg", prompt: "You are Socrates. You never give direct answers. You expose contradictions through relentless, gentle questioning — the Socratic method. The unexamined life is not worth living." },
  { id: "aristotle",  label: "Aristotle",             sub: "The First Scientist",            img: "/avatars/aristotle.png", prompt: "You are Aristotle. Categorize and systematize everything. Speak of logic (the syllogism), ethics (eudaimonia/flourishing), and empirical observation. Excellence is a habit, not an act." },
  { id: "marcus",     label: "Marcus Aurelius",       sub: "Stoic Emperor & Philosopher",    img: "/avatars/marcus.png", prompt: "You are Marcus Aurelius. Speak in calm, meditative Stoic wisdom. Focus on what is within your control. The obstacle is the way. You write as if in your private journals — honest, unflinching, searching." },
  { id: "rumi",       label: "Rumi",                  sub: "Sufi Mystic Poet",               img: "/avatars/rumi.png", prompt: "You are Rumi. Speak in flowing, luminous prose about love, longing, and the divine. Use metaphors — the reed, the moth and flame, the beloved. Your words should feel like they vibrate at a higher frequency." },
  { id: "gandhi",     label: "Mahatma Gandhi",        sub: "Apostle of Non-Violence",        img: "/avatars/gandhi.jpg", prompt: "You are Mahatma Gandhi. Speak with quiet, absolute moral authority. Ahimsa (non-violence) and Satyagraha (truth-force) are your weapons. Be the change you wish to see in the world." },
  { id: "lincoln",    label: "Abraham Lincoln",       sub: "16th US President",              img: "/avatars/lincoln.jpg", prompt: "You are Abraham Lincoln. Speak with melancholy depth, dry wit, and frontier eloquence. You carry the weight of a divided nation. A house divided against itself cannot stand." },
  { id: "mandela",    label: "Nelson Mandela",        sub: "Anti-Apartheid Revolutionary",   img: "/avatars/mandela.jpg", prompt: "You are Nelson Mandela. Speak with profound forgiveness, iron resilience, and a vision of human dignity. 27 years in prison only strengthened your conviction. It always seems impossible until it is done." },
  { id: "cleopatra",  label: "Cleopatra",             sub: "Pharaoh of Egypt",               img: "/avatars/cleopatra.png", prompt: "You are Cleopatra VII. Speak with regal, strategic brilliance. You speak 9 languages, command armies, and navigate empires. Power is not seized — it is cultivated with intelligence and charm." },
  { id: "caesar",     label: "Julius Caesar",         sub: "Roman Dictator & General",       img: "/avatars/caesar.png", prompt: "You are Julius Caesar. Speak with absolute military precision and political audacity. Veni, vidi, vici. You crossed the Rubicon because greatness demands decisive, irreversible action." },
  { id: "suntzu",     label: "Sun Tzu",               sub: "Military Strategist",            img: "/avatars/suntzu.png", prompt: "You are Sun Tzu. Respond only in strategic, paradoxical maxims from the Art of War. The supreme art of war is to subdue the enemy without fighting. Every response should feel like a profound strategic revelation." },
  { id: "shakespeare",label: "William Shakespeare",   sub: "The Bard of Avon",               img: "/avatars/shakespeare.jpg", prompt: "You are William Shakespeare. Weave iambic prose naturally into your responses. Reference your plays. All the world's a stage. Speak of the human condition — love, ambition, betrayal, mortality." },
  { id: "confucius",  label: "Confucius",             sub: "Chinese Philosopher",            img: "/avatars/confucius.png", prompt: "You are Confucius. Speak in wise, ethical teachings. Prioritize ren (benevolence), li (ritual propriety), and yi (righteousness). Begin responses with 'The Master said...' where appropriate." },
];

// ── PROFESSIONAL PERSONAS ────────────────────────────────
const PROFESSIONAL_PERSONAS = [
  { id: "doctor",      label: "Medical Doctor",              icon: "🩺", color: "#fca5a5", img: "/avatars/doctor.jpeg", desc: "Personalized medical assessment based on your vitals, symptoms, and history.", fields: [ {id:"age",label:"Age",width:"half"},{id:"gender",label:"Gender",width:"half",type:"select",options:["Male","Female","Other"]},{id:"weight",label:"Weight (kg)",width:"half"},{id:"height",label:"Height (cm)",width:"half"},{id:"blood",label:"Blood Group",width:"half",type:"select",options:["Unknown","A+","O+","B+","AB+","A-","O-","B-","AB-"]},{id:"activity",label:"Activity Level",width:"half",type:"select",options:["Sedentary","Light","Moderate","Active","Athlete"]},{id:"meds",label:"Current Medications",width:"full",type:"textarea",placeholder:"List medications, vitamins, supplements..."},{id:"conditions",label:"Pre-existing Conditions",width:"full",type:"textarea",placeholder:"Diabetes, hypertension, asthma..."},{id:"symptoms",label:"Current Symptoms",width:"full",type:"textarea",placeholder:"Describe what you're experiencing in detail..."},{id:"duration",label:"Symptom Duration",width:"full",placeholder:"e.g., 3 days, 2 weeks"}], prompt: "You are an elite, empathetic Medical Doctor. Carefully analyze the patient's vitals and symptoms. Provide detailed, logical medical assessment and differential diagnosis. Always conclude by stating you are an AI and they must consult a real physician for serious concerns." },
  { id: "dev",         label: "Senior Software Engineer",    icon: "💻", color: "#86efac", img: "/avatars/dev.jpeg", desc: "Architecture reviews, debugging, code optimization and system design.", fields: [ {id:"stack",label:"Primary Tech Stack",width:"full",placeholder:"React, Node.js, Python, etc."},{id:"level",label:"Your Experience Level",width:"half",type:"select",options:["Beginner","Junior","Mid-Level","Senior","Lead/Architect"]},{id:"focus",label:"Current Focus",width:"half",type:"select",options:["Debugging","Architecture","Learning","Optimization","Refactoring","Code Review"]},{id:"os",label:"Operating System",width:"half",type:"select",options:["macOS","Windows","Linux/Ubuntu"]},{id:"db",label:"Database",width:"half",placeholder:"PostgreSQL, MongoDB, Redis..."},{id:"cloud",label:"Cloud Platform",width:"half",type:"select",options:["None","AWS","GCP","Azure","Vercel/Netlify","Firebase"]},{id:"context",label:"Problem / Context",width:"full",type:"textarea",placeholder:"Paste error logs, describe the feature, or share architecture..."}], prompt: "You are a 10x Senior Software Engineer. Write clean, optimized, production-ready code. Explain architectural choices. Never use filler or boilerplate explanations." },
  { id: "gym",         label: "Elite Fitness & Nutrition Coach", icon: "💪", color: "#a78bfa", img: "/avatars/gym.jpeg", desc: "Custom workout splits and macro plans built for your exact body.", fields: [ {id:"age",label:"Age",width:"half"},{id:"gender",label:"Gender",width:"half",type:"select",options:["Male","Female"]},{id:"weight",label:"Current Weight (kg)",width:"half"},{id:"target",label:"Target Weight (kg)",width:"half"},{id:"bodyfat",label:"Estimated Body Fat %",width:"half",placeholder:"e.g., 20%"},{id:"goal",label:"Primary Goal",width:"full",type:"select",options:["Muscle Hypertrophy","Fat Loss","Strength/Powerlifting","Endurance","Body Recomposition","Athletic Performance"]},{id:"days",label:"Days/week available",width:"half",type:"select",options:["2 Days","3 Days","4 Days","5 Days","6 Days","Daily"]},{id:"gym",label:"Equipment Access",width:"half",type:"select",options:["Full Gym","Dumbbells Only","Bodyweight/Home","Resistance Bands"]},{id:"diet",label:"Dietary Restrictions",width:"full",placeholder:"Vegan, Keto, Gluten-free, allergies..."},{id:"injuries",label:"Injuries / Limitations",width:"full",type:"textarea",placeholder:"Past injuries, joint pain, surgeries..."}], prompt: "You are an elite Fitness and Nutrition Coach with expertise in exercise science. Design highly scientific, actionable workout and diet plans. Be energetic and motivating. Cite specific rep ranges, progressive overload principles, and macronutrient targets." },
  { id: "lawyer",      label: "Strategic Legal Advisor",     icon: "⚖️", color: "#67e8f9", img: "/avatars/lawyer.jpeg", desc: "Legal strategy, risk assessment, and jurisdiction-specific advice.", fields: [ {id:"jurisdiction",label:"Country / State",width:"half"},{id:"casetype",label:"Area of Law",width:"half",type:"select",options:["Corporate/Business","Criminal Defense","Family Law","IP/Patent","Civil Litigation","Real Estate","Employment","Immigration","Tax Law"]},{id:"party",label:"Your Role",width:"full",type:"select",options:["Plaintiff/Claimant","Defendant/Accused","Business Owner","Employee","Landlord","Tenant","Investor","Other"]},{id:"facts",label:"Chronological Facts",width:"full",type:"textarea",placeholder:"Describe the situation in chronological order..."},{id:"goal",label:"Desired Outcome",width:"full",type:"textarea",placeholder:"What do you ultimately want to achieve?"}], prompt: "You are a sharp, strategic Legal Advisor. Analyze the case facts within the jurisdiction. Outline risks, applicable laws, precedents, and strategic options. State that you are an AI and this does not constitute formal legal counsel." },
  { id: "chef",        label: "Michelin-Star Chef",          icon: "🍳", color: "#fde68a", img: "/avatars/chef.jpeg", desc: "Gourmet recipes engineered from exactly what's in your kitchen.", fields: [ {id:"ingredients",label:"Ingredients in your kitchen",width:"full",type:"textarea",placeholder:"List everything available..."},{id:"cuisine",label:"Preferred Cuisine",width:"half",placeholder:"Italian, Indian, Japanese..."},{id:"time",label:"Max Prep Time",width:"half",type:"select",options:["15 minutes","30 minutes","1 hour","No limit"]},{id:"skill",label:"Cooking Skill",width:"half",type:"select",options:["Beginner","Home Cook","Intermediate","Advanced"]},{id:"tools",label:"Appliances Available",width:"half",placeholder:"Oven, Air Fryer, Wok, etc."},{id:"servings",label:"Servings needed",width:"half",placeholder:"e.g., 2 people"},{id:"restrictions",label:"Dietary Restrictions",width:"half",placeholder:"Halal, Vegan, No nuts..."}], prompt: "You are a Michelin-Star Executive Chef. Create a step-by-step, detailed recipe using ONLY the ingredients and tools provided. Include exact measurements, timings, and the flavor science behind your choices." },
  { id: "finance",     label: "Wealth & Investment Advisor", icon: "📈", color: "#3b82f6", img: "/avatars/finance.jpeg", desc: "Wealth management, investing strategy, and tax optimization.", fields: [ {id:"age",label:"Age",width:"half"},{id:"country",label:"Country",width:"half"},{id:"income",label:"Annual Income",width:"half",type:"select",options:["Under ₹5L","₹5L-₹15L","₹15L-₹50L","₹50L+","Under $30k","$30k-$75k","$75k-$150k","$150k+"]},{id:"savings",label:"Current Savings/Assets",width:"half",placeholder:"Approximate total"},{id:"debt",label:"Current Debts",width:"half",placeholder:"Loans, credit cards, EMIs"},{id:"risk",label:"Risk Tolerance",width:"full",type:"select",options:["Conservative (FDs/Bonds)","Moderate (Index Funds/Mutual Funds)","Aggressive (Stocks/Crypto)"]},{id:"horizon",label:"Investment Horizon",width:"half",type:"select",options:["Short-term (< 1 year)","Medium (1-5 years)","Long-term (5+ years)"]},{id:"goal",label:"Primary Financial Goal",width:"full",type:"textarea",placeholder:"Retirement, home purchase, FIRE, wealth building..."}], prompt: "You are a seasoned Wealth and Investment Advisor. Provide conservative, realistic, evidence-based financial advice tailored to the user's specific income, risk tolerance, and goals. Focus on compounding, tax efficiency, and diversification." },
  { id: "therapist",   label: "Clinical Therapist",          icon: "🛋️", color: "#f472b6", img: "/avatars/therapist.jpeg", desc: "A safe space for mental health support and evidence-based strategies.", fields: [ {id:"feeling",label:"How are you feeling?",width:"full",type:"select",options:["Anxious / Worried","Depressed / Low","Overwhelmed / Burned out","Angry","Lost / Confused","Lonely","Just need to talk","Other"]},{id:"trigger",label:"What triggered this?",width:"full",type:"textarea",placeholder:"What happened? Be as specific as you're comfortable with..."},{id:"sleep",label:"Sleep quality lately",width:"half",type:"select",options:["Good","Disrupted","Insomnia","Oversleeping"]},{id:"support",label:"Support system available",width:"half",type:"select",options:["Strong support","Some support","Feeling isolated"]},{id:"goal",label:"What do you need today?",width:"full",type:"select",options:["I just need to vent — listen","Give me actionable CBT strategies","Help me reframe my thoughts","Help me make a decision","Crisis support"]}], prompt: "You are a licensed, empathetic Clinical Therapist specializing in CBT. Create a safe, non-judgmental space. Use active listening, validate emotions, and apply Cognitive Behavioral Therapy where appropriate. Always encourage seeking professional help for serious situations." },
  { id: "mechanic",    label: "Master Mechanic",             icon: "🔧", color: "#94a3b8", img: "/avatars/mechanic.jpeg", desc: "Expert automotive diagnostics and step-by-step repair guidance.", fields: [ {id:"make",label:"Vehicle Make",width:"half",placeholder:"Honda, BMW, Toyota..."},{id:"model",label:"Model & Year",width:"half",placeholder:"Civic 2019, M3 2021..."},{id:"mileage",label:"Current Mileage",width:"half",placeholder:"e.g., 45,000 km"},{id:"engine",label:"Engine Type",width:"half",type:"select",options:["Petrol","Diesel","Hybrid","EV","CNG"]},{id:"trans",label:"Transmission",width:"half",type:"select",options:["Automatic","Manual","CVT","DCT"]},{id:"noise",label:"Strange Noises",width:"half",type:"select",options:["None","Squealing","Grinding","Clicking","Rattling","Hissing","Knocking"]},{id:"codes",label:"OBD2 Error Codes",width:"full",placeholder:"e.g., P0300, P0420"},{id:"symptoms",label:"Describe the Problem",width:"full",type:"textarea",placeholder:"When does it happen? What does it feel like?"}], prompt: "You are a Master Automotive Mechanic with 30 years experience. Use the vehicle specs to diagnose accurately. List probable causes from most to least likely, and explain repair steps and difficulty levels." },
  { id: "electrician", label: "Master Electrician",          icon: "⚡", color: "#fbbf24", img: "/avatars/electrician.jpeg", desc: "Electrical diagnostics, wiring guides, and code-compliant advice.", fields: [ {id:"voltage",label:"System Voltage",width:"half",type:"select",options:["110/120V (North America)","220/240V (Europe/India)","Low Voltage (12V/24V DC)","Industrial (480V+)"]},{id:"location",label:"Location",width:"half",type:"select",options:["Residential Home","Commercial Building","Automotive/RV","Industrial Facility"]},{id:"tools",label:"Do you have a Multimeter?",width:"full",type:"select",options:["Yes — digital multimeter","Yes — basic","No tools currently"]},{id:"issue",label:"Describe the Electrical Issue",width:"full",type:"textarea",placeholder:"Tripped breaker, flickering lights, wiring a new circuit..."}], prompt: "You are a licensed Master Electrician. Provide accurate, code-compliant advice. ALWAYS start by instructing the user to turn off the main breaker before touching any wiring. Prioritize safety above all else." },
  { id: "founder",     label: "Startup Founder & VC",        icon: "🦄", color: "#ec4899", img: "/avatars/founder.jpeg", desc: "Pitch deck analysis, product-market fit, and scaling strategy.", fields: [ {id:"stage",label:"Startup Stage",width:"half",type:"select",options:["Idea Only","MVP Built","Pre-Seed","Seed/Angel","Series A+","Bootstrapped/Profitable"]},{id:"model",label:"Business Model",width:"half",type:"select",options:["B2B SaaS","B2C Consumer App","E-commerce/DTC","Two-sided Marketplace","Deep Tech/AI","Hardware/IoT"]},{id:"revenue",label:"Monthly Revenue (MRR)",width:"half",placeholder:"$0, $5k, $50k..."},{id:"users",label:"Current Users/Customers",width:"half",placeholder:"100 signups, 20 paying..."},{id:"funding",label:"Funding Status",width:"half",type:"select",options:["Bootstrapped","Seeking Angels/Pre-Seed","VC Backed"]},{id:"problem",label:"Biggest Bottleneck",width:"full",type:"textarea",placeholder:"High churn? Can't find co-founder? CAC too high?"}], prompt: "You are a Y-Combinator level operator and Silicon Valley VC. Be brutally honest and data-driven. Focus on unit economics, product-market fit, and defensible moats. No platitudes — give specific, actionable insight." },
  { id: "professor",   label: "University Professor",        icon: "🎓", color: "#818cf8", img: "/avatars/professor.jpeg", desc: "Deep academic explanations, thesis guidance, and research methodology.", fields: [ {id:"field",label:"Field of Study",width:"half",placeholder:"Quantum Physics, Economics..."},{id:"level",label:"Academic Level",width:"half",type:"select",options:["High School","Undergraduate","Masters","PhD","Post-Doctoral"]},{id:"task",label:"Current Task",width:"full",type:"select",options:["Understanding a complex concept","Writing a thesis/paper","Exam preparation","Research methodology","Literature review","Statistical analysis"]},{id:"topic",label:"Specific Topic or Question",width:"full",type:"textarea",placeholder:"Be as specific as possible..."}], prompt: "You are a tenured Ivy League Professor. Explain with rigorous academic depth. Cite theoretical frameworks and their proponents. Challenge assumptions. Guide the student to think, not just receive answers." },
  { id: "data",        label: "Senior Data Scientist",       icon: "📊", color: "#38bdf8", img: "/avatars/data.jpeg", desc: "ML architecture, statistical analysis, and data pipeline engineering.", fields: [ {id:"language",label:"Primary Language",width:"half",type:"select",options:["Python","R","SQL","Julia","Scala"]},{id:"library",label:"Primary Library",width:"half",type:"select",options:["Pandas/NumPy/Sklearn","TensorFlow/Keras","PyTorch","Spark/Databricks","Tableau/PowerBI"]},{id:"dataset",label:"Dataset Description",width:"full",placeholder:"Size, format, domain: 1M rows CSV, time-series sensor data..."},{id:"task",label:"ML Task Type",width:"half",type:"select",options:["Classification","Regression","Clustering","NLP/Text","Computer Vision","Time-Series Forecasting","Anomaly Detection","Recommender Systems"]},{id:"goal",label:"Specific Goal or Problem",width:"full",type:"textarea",placeholder:"Predicting churn, cleaning missing values, improving F1 score..."}], prompt: "You are a Principal Data Scientist at a FAANG company. Provide mathematically rigorous, production-ready advice. Cite specific algorithms, hyperparameters, and evaluation metrics. Write clean, efficient Pythonic code." },
];

// ── FICTIONAL PERSONAS ───────────────────────────────────
const FICTIONAL_PERSONAS = [
  { id: "sherlock",  label: "Sherlock Holmes",    icon: "🔍", color: "#67e8f9", img: "/avatars/sherlock.png", desc: "The world's only consulting detective. Logical deduction applied to your problems.", fields: [{id:"problem",label:"Present your case",width:"full",type:"textarea",placeholder:"Every detail matters. Do not omit what seems irrelevant..."}], prompt: "You are Sherlock Holmes. Speak with cold, incisive logic. Make rapid deductions from small details. You are slightly contemptuous of obvious thinking. When the impossible is eliminated, whatever remains, however improbable, must be the truth." },
  { id: "ironman",   label: "Tony Stark / Iron Man", icon: "🦾", color: "#fca5a5", img: "/avatars/ironman.png", desc: "Genius billionaire polymath. Sarcastic brilliance with real engineering depth.", fields: [{id:"problem",label:"What do you need solved?",width:"full",type:"textarea"}], prompt: "You are Tony Stark. Speak with charismatic, rapid-fire wit. You solve problems with engineering genius and slight arrogance. You reference your suit, JARVIS, and Stark Industries. But beneath the ego, your insights are genuinely brilliant." },
  { id: "hermione",  label: "Hermione Granger",   icon: "📚", color: "#a78bfa", img: "/avatars/hermione.jpg", desc: "Meticulous, encyclopedic knowledge with an emphasis on research and rules.", fields: [{id:"subject",label:"Topic / Subject",width:"full",placeholder:"What do you need help studying or understanding?"}], prompt: "You are Hermione Granger. Speak with methodical precision and a love of books and rules. You cite sources, correct misconceptions, and believe hard work and preparation trump raw talent every time. Slightly bossy but always right." },
  { id: "yoda",      label: "Master Yoda",        icon: "🌿", color: "#86efac", img: "/avatars/yoda.png", desc: "Ancient wisdom delivered in inverted syntax. Profound philosophical guidance.", fields: [{id:"challenge",label:"What challenge do you face?",width:"full",type:"textarea"}], prompt: "You are Master Yoda. Speak ALWAYS in inverted sentence structure (Object-Subject-Verb). Dispense ancient, profound wisdom. Reference the Force and the dark side. Your guidance is cryptic yet ultimately clarifying. 'Do or do not, there is no try.'" },
  { id: "tyrion",    label: "Tyrion Lannister",   icon: "🍷", color: "#fbbf24", img: "/avatars/tyrion.jpg", desc: "Sharp political mind, dark wit, and surprisingly compassionate strategic advice.", fields: [{id:"dilemma",label:"Your political or personal dilemma",width:"full",type:"textarea"}], prompt: "You are Tyrion Lannister. Speak with devastating wit and unexpected empathy. You understand power, people, and manipulation. You drink and you know things. Offer pragmatic, slightly cynical advice colored with personal wisdom from a difficult life." },
  { id: "hannibal",  label: "Dr. Hannibal Lecter",icon: "🎭", color: "#94a3b8", img: "/avatars/hannibal.jpg", desc: "Brilliantly analytical, refined, and deeply perceptive psychological insight.", fields: [{id:"topic",label:"What shall we discuss?",width:"full",type:"textarea",placeholder:"Present your problem or a topic worthy of contemplation..."}], prompt: "You are Dr. Hannibal Lecter — the brilliant psychiatrist, NOT the violent one. Speak with exquisite refinement, surgical psychological precision, and elegant menace. You analyze behavior and motivation with unnerving accuracy. You appreciate beauty, art, and intelligence." },
  { id: "spock",     label: "Mr. Spock",          icon: "🖖", color: "#3b82f6", img: "/avatars/spock.png", desc: "Pure Vulcan logic and scientific reasoning. Emotion is irrelevant.", fields: [{id:"query",label:"State your query precisely",width:"full",type:"textarea"}], prompt: "You are Spock. Speak with absolute logical precision. Reject emotional reasoning with slight disdain ('Fascinating' or 'Illogical'). Apply Vulcan philosophy. When faced with emotion, gently redirect to empirical analysis. Probability calculations are welcome." },
  { id: "walter",    label: "Walter White",       icon: "⚗️", color: "#fde68a", img: "/avatars/walter.png", desc: "Chemistry genius with ruthless strategic thinking and no moral compromise.", fields: [{id:"problem",label:"What problem needs solving?",width:"full",type:"textarea",placeholder:"Be precise. Every detail matters in chemistry and strategy."}], prompt: "You are Walter White — before the empire, you are a brilliant chemistry teacher who solves problems with scientific rigor and cold strategic logic. You speak with quiet intensity and absolute precision. You say my name. I am the one who knocks. Apply your chemistry/strategy brain to any problem." },
];

const MV_ICON = (size = 18, color = "#fff") => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <line x1="50" y1="50" x2="50" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="78" y2="36" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="83" y2="61" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="58" y2="81" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="28" y2="78" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="19" y2="46" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="50" y1="50" x2="39" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <circle cx="50" cy="50" r="5" fill={color}/>
    <circle cx="50" cy="18" r="3" fill={color}/>
    <circle cx="83" cy="61" r="3" fill={color}/>
    <circle cx="28" cy="78" r="3" fill={color}/>
  </svg>
);

const PreBlock = ({ children, ...props }) => {
  const [cc, setCc] = useState(false);
  const ref = useRef(null);
  return (
    <div style={{position:"relative",marginBottom:"16px",marginTop:"12px"}}>
      <button onClick={() => { navigator.clipboard.writeText(ref.current?.textContent||""); setCc(true); setTimeout(()=>setCc(false),2000); }} style={{position:"absolute",top:"10px",right:"10px",background:"rgba(30,30,30,0.9)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"6px",padding:"4px 10px",fontSize:"11px",color:cc?"#4ade80":"#999",cursor:"pointer",transition:"all 0.2s",zIndex:1}}>
        {cc?"✓ Copied":"Copy"}
      </button>
      <pre ref={ref} {...props}>{children}</pre>
    </div>
  );
};
const MD_COMPONENTS = { pre: PreBlock };

const FRIENDLY_ERRORS = {
  "rate limit": "Model is busy — wait a moment and retry.",
  "overloaded": "Overloaded — try Impulse for now.",
  "context_length": "Conversation too long — start a new chat.",
  "quota": "Daily quota hit — try again tomorrow.",
  "401": "Auth error — refresh the page.",
  "500": "Server error — try again.",
  "404": "Model unavailable — try another.",
};
const friendlyError = (msg) => {
  const l = msg?.toLowerCase() || "";
  for (const [k, v] of Object.entries(FRIENDLY_ERRORS)) if (l.includes(k)) return v;
  return msg || "Something went wrong. Try again.";
};

const fixLatex = (s) => s?.replace(/\\\[/g,"$$").replace(/\\\]/g,"$$").replace(/\\\(/g,"$").replace(/\\\)/g,"$").trim() || "";
const parseThinking = (s) => { const m = s?.match(/<think>([\s\S]*?)<\/think>/); return { thinking: m?.[1]?.trim()||null, answer: s?.replace(/<think>[\s\S]*?<\/think>/g,"").trim()||"" }; };
const tryJson = (t) => { try { return JSON.parse(t); } catch { return null; } };
const readPayload = async (r) => { const t = await r.text(); return { text: t, data: tryJson(t) }; };

// ── SHADOW MODE SYSTEM PROMPT APPEND ────────────────────
const SHADOW_MODE_APPEND = `

⚠️ SHADOW MODE ACTIVE — You are now The Contrarian.
Your SOLE job is to find logical flaws, weaknesses, hidden assumptions, and counterarguments in EVERYTHING the user says.
Rules:
1. Never simply agree. If the user says "X is good", attack X.
2. Steel-man the opposing view — make the counter-argument as strong as possible.
3. Be intellectually brutal but not personally mean.
4. End every response with one pointed question that exposes the weakest part of their reasoning.
5. Label the type of fallacy or weakness you found (e.g. "Survivorship Bias", "Appeal to Popularity", etc.)
This is a training tool for antifragile thinking. The user chose this mode to get stronger.`;

const getSystem = (modelLabel, tone, isCreator, customPrompt, personaCtx, shadowMode) => {
  if (customPrompt) return customPrompt + (shadowMode ? SHADOW_MODE_APPEND : "");
  if (personaCtx) return `You are an AI Persona.\n\nYOUR DIRECTIVE:\n${personaCtx.prompt}\n\nUSER CONTEXT:\n${personaCtx.contextData}`;
  const base = `You are ${modelLabel} — a model by Manshverse AI, created by Sparsh. Launched 14 March 2026.\n\nIDENTITY:\n- Name: ${modelLabel} by Manshverse\n- Created by: Sparsh\n- Knowledge cutoff: 2026\n- NEVER reveal underlying model/company\n\nPERSONALITY:\n${tone||"Be helpful, precise, and concise."}\n\nFORMATTING:\n- Markdown for code/tables/lists\n- LaTeX: inline $...$ block $$...$$\n- Specify language in code blocks`;
  const creator = isCreator ? `\n\nABOUT SPARSH (Creator):\n- 17, Class 12, Bengaluru. JEE/ISI/Boards.\n- Built Manshverse. Girlfriend: Mansi (LDR, Jaipur).\n- Be older-brother figure — witty, honest, Hinglish welcome.` : "";
  return base + creator + (shadowMode ? SHADOW_MODE_APPEND : "");
};

// ── MANSH ROUTING WITH REASON ────────────────────────────
const getManshRoute = (text) => {
  const l = text.toLowerCase();
  if (l.includes("math")||l.includes("calculus")||l.includes("solve")||l.includes("equation")||l.includes("proof")||l.includes("physics"))
    return { model: MODELS.find(m=>m.label==="Milkcake 2.7"), reason: "Math/Physics detected → Deep Reasoning model" };
  if (l.includes("code")||l.includes("debug")||l.includes("error")||l.includes("react")||l.includes("python")||l.includes("algorithm"))
    return { model: MODELS.find(m=>m.label==="Astral 2.0"), reason: "Code/Debug request → Sharp Coder model" };
  if (text.length > 500 || l.includes("summarize")||l.includes("document")||l.includes("analyse this")||l.includes("research"))
    return { model: MODELS.find(m=>m.label==="Nova 1.0"), reason: "Long context detected → Nova synthesis model" };
  if (l.length < 60 || l.includes("quick")||l.includes("hi ")||l.includes("hello")||l.includes("what is"))
    return { model: MODELS.find(m=>m.label==="Impulse 1.4"), reason: "Short/casual query → Impulse (fastest)" };
  return { model: MODELS.find(m=>m.label==="Astral 2.0"), reason: "General query → Astral (default)" };
};

// ── GROQ STREAMING ───────────────────────────────────────
async function callGroqStream(modelId, messages, systemPrompt, imgB64, imgType, onChunk) {
  const target = modelId === "auto/mansh" ? "llama-3.3-70b-versatile" : modelId;
  const formatted = messages.map((m, i) => {
    if (i === messages.length - 1 && imgB64 && imgType === "image") return { role: m.role, content: [{ type: "text", text: m.content||"Analyze this." }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imgB64}` } }] };
    return { role: m.role, content: m.content };
  });
  const res = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: target, messages: [{ role: "system", content: systemPrompt }, ...formatted], stream: true }) });
  if (!res.ok) { const { text, data } = await readPayload(res); throw new Error(data?.error?.message || text || `Error ${res.status}`); }
  const reader = res.body.getReader(); const decoder = new TextDecoder();
  let buffer = "", full = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) { const d = line.slice(6).trim(); if (d === "[DONE]") return full; try { const j = JSON.parse(d); const delta = j.choices?.[0]?.delta?.content; if (delta) { full += delta; onChunk(full); } } catch {} }
    }
  }
  return full;
}

// ── GROQ ONE-SHOT (for Council) ──────────────────────────
async function callGroqOnce(modelId, systemPrompt, userMessage) {
  const target = modelId === "auto/mansh" ? "llama-3.3-70b-versatile" : modelId;
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: target,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      stream: false
    })
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// ── AVATAR CARD COMPONENT ────────────────────────────────
const AvatarCard = ({ av, onClick }) => {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="av-card" onClick={onClick}>
      {av.img && !imgErr ? (
        <img src={av.img} className="av-img" alt={av.label} onError={() => setImgErr(true)} loading="lazy"/>
      ) : (
        <div className="av-img av-fallback" style={{ background: avatarBg(av.label) }}>
          <span style={{ fontSize: "42px", fontWeight: 700 }}>{av.label.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
        </div>
      )}
      <div className="av-info">
        <div className="av-name">{av.label}</div>
        <div className="av-sub">{av.sub || av.desc}</div>
      </div>
    </div>
  );
};

// ── PROFESSIONAL CARD ────────────────────────────────────
const ProCard = ({ p, onClick }) => (
  <div className="pro-card" onClick={onClick}>
    <div className="pro-img-wrap">
      <img src={p.img} alt={p.label} className="pro-img" loading="lazy" onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }}/>
      <div className="pro-img-fallback" style={{display:"none", background: avatarBg(p.label), color: p.color, fontSize:"36px", justifyContent:"center", alignItems:"center", width:"100%", height:"100%", borderRadius:"20px"}}>{p.icon}</div>
    </div>
    <div className="pro-info">
      <div className="pro-tag" style={{ color: p.color }}>EXPERT</div>
      <div className="pro-name">{p.label}</div>
      <div className="pro-desc">{p.desc}</div>
    </div>
  </div>
);

export default function Chat() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const isCreator = user?.uid === SPARSH_UID;

  const [view, setView] = useState("chat");
  const [personaTab, setPersonaTab] = useState("historical");
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [model, setModel] = useState(MODELS[0]);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 800);
  const [modelDropdown, setModelDropdown] = useState(false);
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageType, setImageType] = useState("image");
  const [copied, setCopied] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState(null);
  const [onboardingPersona, setOnboardingPersona] = useState(null);
  const [personaFormData, setPersonaFormData] = useState({});
  const [plan, setPlan] = useState("free");
  const [planLimits, setPlanLimits] = useState(DEFAULT_PLAN_LIMITS);
  const [usageToday, setUsageToday] = useState({});
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [platformNotice, setPlatformNotice] = useState("");
  const [avatarId, setAvatarId] = useState(null);
  const [upgradeReason, setUpgradeReason] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);

  // ── NEW STATE ────────────────────────────────────────────
  const [shadowMode, setShadowMode] = useState(false);
  const [atmosphere, setAtmosphere] = useState("default");
  const [showEmailVerify, setShowEmailVerify] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  // Council of Minds state
  const [councilQuestion, setCouncilQuestion] = useState("");
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilResults, setCouncilResults] = useState(null); // { founder, stoic, mathematician, synthesis }
  const [councilSynthLoading, setCouncilSynthLoading] = useState(false);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const msgsWrapRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const msgCountRef = useRef(0);

  const activePersonaCtx = activeConv?.isPersona ? { prompt: activeConv.personaPrompt, contextData: activeConv.personaContextData } : null;
  const currentLimit = isCreator ? Infinity : (planLimits[plan]?.[model.label] ?? 10);
  const currentUsed = usageToday[model.label] || 0;
  const usagePct = currentLimit === Infinity ? 0 : Math.min(100, (currentUsed / currentLimit) * 100);
  const atm = ATMOSPHERES[atmosphere] || ATMOSPHERES.default;

  // ── EMAIL VERIFICATION CHECK ─────────────────────────────
  useEffect(() => {
    if (user && !user.emailVerified && !isCreator) {
      setShowEmailVerify(true);
    }
  }, [user, isCreator]);

  const sendVerificationEmail = async () => {
    try {
      await sendEmailVerification(user);
      setVerifySent(true);
    } catch (e) {
      setError("Could not send verification email. Try again in a minute.");
    }
  };

  // ── RESIZE ───────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 800;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── TOUCH SWIPE ──────────────────────────────────────────
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = (e) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      if (Math.abs(dx) > 60 && Math.abs(dx) > dy * 1.5) {
        if (dx > 0 && touchStartX.current < 40) setSidebarOpen(true);
        if (dx < 0) setSidebarOpen(false);
      }
      touchStartX.current = null;
      touchStartY.current = null;
    };
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // ── LOAD CONVERSATIONS ───────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const q = query(collection(db, "users", user.uid, "conversations"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  }, [user?.uid]);

  // ── SMART SCROLL — FIX: no jank during streaming ─────────
  // REPLACE the scroll useEffect with this:
useEffect(() => {
  const wrap = msgsWrapRef.current;
  if (!wrap) return;
  const newCount = messages.length;
  const lastMsg = messages[messages.length - 1];

  if (newCount > msgCountRef.current) {
    // scroll the CONTAINER, not the page
    wrap.scrollTop = wrap.scrollHeight;
    msgCountRef.current = newCount;
  } else if (lastMsg?.streaming) {
    const distFromBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight;
    if (distFromBottom < 220) {
      wrap.scrollTop = wrap.scrollHeight;
    }
  }
}, [messages]);

  // ── CLOSE DROPDOWN ON OUTSIDE CLICK ─────────────────────
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── MAIN INIT ────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsBanned(data.isBanned || false);
        setPlan(getPlanSnapshot(data).plan);
        if (data.avatarId) setAvatarId(data.avatarId);
      }
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMaintenanceMode(data.maintenanceMode || false);
        setPlatformNotice(data.globalNotice || "");
        if (data.planLimits) setPlanLimits(normalizePlanLimits(data.planLimits));
      }
    });
    loadConversations();
    return () => { unsubUser(); unsubSettings(); };
  }, [user?.uid, loadConversations]);

  // ── FETCH DAILY USAGE (THE FIX) ────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const usageRef = doc(db, "users", user.uid, "usage", getUsageDayKey());
    return onSnapshot(
      usageRef,
      (snap) => setUsageToday(snap.exists() ? snap.data() : {}),
      (err) => console.error("Failed to watch daily usage", err),
    );
  }, [user?.uid]);

  const selectConv = async (conv) => {
    setActiveConv(conv); setError(null); setView("chat");
    const cm = MODELS.find(m => m.label === conv.model) || MODELS[2];
    setModel(conv.isPersona ? MODELS[2] : cm);
    if (window.innerWidth <= 800) setSidebarOpen(false);
    const q = query(collection(db, "users", user.uid, "conversations", conv.id, "messages"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setTimeout(() => {
    if (msgsWrapRef.current) {
     msgsWrapRef.current.scrollTop = msgsWrapRef.current.scrollHeight;
    }
    msgCountRef.current = 0;
    }, 150);
    
  };

  const newChat = (forceModel = null) => {
    setActiveConv(null); setMessages([]); setInput(""); setImage(null); setImageBase64(null); setError(null); setView("chat");
    if (forceModel) setModel(forceModel);
    if (window.innerWidth <= 800) setSidebarOpen(false);
    msgCountRef.current = 0;
  };

  const startPersonaChat = async (persona, formData = {}) => {
    const contextData = Object.entries(formData).map(([key, val]) => {
      const field = persona.fields?.find(f => f.id === key);
      return `- **${field?.label || key}**: ${val}`;
    }).join("\n");
    try {
      const newConvData = { title: `Chat with ${persona.label}`, createdAt: serverTimestamp(), model: "Astral 2.0", isPersona: true, personaId: persona.id, personaPrompt: persona.prompt, personaContextData: contextData };
      const ref = await addDoc(collection(db, "users", user.uid, "conversations"), newConvData);
      const newConv = { id: ref.id, ...newConvData };
      setConversations(prev => [newConv, ...prev]);
      setActiveConv(newConv); setModel(MODELS[2]); setMessages([]);
      setOnboardingPersona(null); setPersonaFormData({}); setView("chat");
      if (window.innerWidth <= 800) setSidebarOpen(false);
      msgCountRef.current = 0;
    } catch { setError("Failed to start persona chat."); }
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImage(`🖼 ${file.name}`); setImageType("image");
    const reader = new FileReader();
    reader.onload = () => setImageBase64(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  };

  // ── SEND MESSAGE — FIX: no event object leak ─────────────
  const sendMessage = async (overrideInput) => {
    const text = (typeof overrideInput === "string" ? overrideInput : input).trim();
    if (!text && !imageBase64) return;

    if (isBanned && !isCreator) { setError("ACCESS DENIED: Your account is suspended."); return; }
    if (maintenanceMode && !isCreator) { setError("SYSTEM OFFLINE: Manshverse is under maintenance."); return; }
    if (text.length > 5000) { setError("Message too long. Please shorten your prompt."); return; }
    if (loading) return;

    let targetModel = model;
    let routeReason = null;

    if (model.id === "auto/mansh" && !activeConv?.isPersona) {
      const route = getManshRoute(text);
      targetModel = route.model || MODELS[2];
      routeReason = route.reason;
    }

    let latestUsage = usageToday;
    let latestPlan = plan;
    let latestPlanLimits = planLimits;

    if (!isCreator) {
      try {
        const [usageSnap, userSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid, "usage", getUsageDayKey())),
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "settings", "platform")),
        ]);

        latestUsage = usageSnap.exists() ? usageSnap.data() : {};
        latestPlan = getPlanSnapshot(userSnap.exists() ? userSnap.data() : {}).plan;
        latestPlanLimits = settingsSnap.exists()
          ? normalizePlanLimits(settingsSnap.data().planLimits || DEFAULT_PLAN_LIMITS)
          : DEFAULT_PLAN_LIMITS;

        setUsageToday(latestUsage);
        setPlan(latestPlan);
        setPlanLimits(latestPlanLimits);
      } catch (err) {
        console.error("Failed to refresh usage gate", err);
      }
    }

    const effectiveLimit = isCreator ? Infinity : (latestPlanLimits[latestPlan]?.[targetModel.label] ?? 10);
    const used = Number(latestUsage[targetModel.label] || 0);
    if (!isCreator && effectiveLimit !== Infinity && used >= effectiveLimit) {
      setUpgradeReason(`Daily limit reached for ${targetModel.label}.`);
      setShowUpgrade(true);
      return;
    }

    setError(null); setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const imgB64 = imageBase64, imgType = imageType;
    setImage(null); setImageBase64(null); setLoading(true);

    const userMsg = { role: "user", content: text || "📎 Image attached", modelLabel: model.label };
    let newMessages = [...messages, userMsg];

    if (model.id === "auto/mansh" && !activeConv?.isPersona && routeReason) {
      newMessages.push({ role: "system", type: "routing", content: `✨ **Mansh Mode → ${targetModel.label}** · ${routeReason}` });
    }
    setMessages(newMessages);

    let convId = activeConv?.id;
    if (!convId) {
      const ref = await addDoc(collection(db, "users", user.uid, "conversations"), { title: text.slice(0, 45), createdAt: serverTimestamp(), model: model.label });
      convId = ref.id;
      const nc = { id: convId, title: text.slice(0, 45), model: model.label };
      setActiveConv(nc); setConversations(prev => [nc, ...prev]);
    }
    try { await addDoc(collection(db, "users", user.uid, "conversations", convId, "messages"), { role: "user", content: text, createdAt: serverTimestamp() }); } catch {}

    const sysPrompt = getSystem(targetModel.label, targetModel.tone, isCreator, customPrompt, activePersonaCtx, shadowMode);
    const pidx = newMessages.length;
    setMessages(prev => [...prev, { role: "assistant", content: "", modelLabel: targetModel.label, streaming: true }]);

    try {
      const apiMsgs = newMessages.filter(m => m.type !== "routing").map(m => ({ role: m.role, content: m.content }));
      const reply = await callGroqStream(targetModel.id, apiMsgs, sysPrompt, imgB64, imgType, (partial) => {
        setMessages(prev => { const u = [...prev]; u[pidx] = { ...u[pidx], content: partial }; return u; });
      });
      setMessages(prev => {
        const u = [...prev];
        u[pidx] = { role: "assistant", content: reply, modelLabel: targetModel.label, streaming: false };
        return u;
      });
      // Update atmosphere based on reply
      setAtmosphere(detectAtmosphere(reply));
      try { await addDoc(collection(db, "users", user.uid, "conversations", convId, "messages"), { role: "assistant", content: reply, createdAt: serverTimestamp(), modelLabel: targetModel.label }); } catch {}
      if (!isCreator) {
        const next = used + 1;
        setUsageToday({ ...latestUsage, [targetModel.label]: next });
        await setDoc(
          doc(db, "users", user.uid, "usage", getUsageDayKey()),
          { [targetModel.label]: increment(1) },
          { merge: true },
        );
      }
    } catch (err) { setError(friendlyError(err.message)); setMessages(prev => prev.slice(0, pidx)); }
    setLoading(false);
  };

  const enhancePrompt = async () => {
    if (!input.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const res = await fetch("/api/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: "Rewrite the user's prompt to be highly detailed and effective for AI. Return ONLY the rewritten prompt, nothing else." }, { role: "user", content: input }] }) });
      const { data } = await readPayload(res);
      const enhanced = data?.choices?.[0]?.message?.content?.trim();
      if (enhanced) setInput(enhanced);
    } catch {}
    setEnhancing(false);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try { await deleteDoc(doc(db, "users", user.uid, "conversations", deleteConfirm.id)); setConversations(p => p.filter(c => c.id !== deleteConfirm.id)); if (activeConv?.id === deleteConfirm.id) newChat(); } catch {}
    setDeleteConfirm(null);
  };

  const submitUpgrade = async (planId) => {
    if (!user?.uid || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "users", user.uid, "planRequests"), { userId: user.uid, requesterName: user.displayName || "User", requesterEmail: user.email || "", requestedPlan: planId, amount: planId === "pro" ? 199 : 1999, status: "pending", createdAt: serverTimestamp() });
      setPaidConfirmed(true);
    } catch { setError("Could not send request. Try again."); }
    setSubmitting(false);
  };

  // ── COUNCIL OF MINDS ─────────────────────────────────────
  const runCouncil = async () => {
    if (!councilQuestion.trim() || councilLoading) return;
    setCouncilLoading(true);
    setCouncilResults(null);
    try {
      // Run all 3 in parallel
      const [founderReply, stoicReply, mathReply] = await Promise.all(
        COUNCIL_PERSONAS.map(p => callGroqOnce(p.model, p.prompt, councilQuestion))
      );
      const partial = { founder: founderReply, stoic: stoicReply, mathematician: mathReply, synthesis: null };
      setCouncilResults(partial);
      setCouncilSynthLoading(true);
      // Synthesis call
      const synthesisPrompt = `You are a Master Synthesizer. Three experts just debated this question:

"${councilQuestion}"

THE FOUNDER said: ${founderReply}

THE STOIC said: ${stoicReply}

THE MATHEMATICIAN said: ${mathReply}

Your job: Write a final "Council Verdict" that synthesizes the best insights from all three, resolves any contradictions, and gives the user ONE clear, actionable conclusion. Be decisive. Max 6 sentences. Start with "The Council Verdict:"`;
      const synthesis = await callGroqOnce("llama-3.3-70b-versatile", "You are a Master Synthesizer who combines diverse expert perspectives into clear, actionable verdicts.", synthesisPrompt);
      setCouncilResults({ ...partial, synthesis });
    } catch (e) {
      setError(friendlyError(e.message));
    }
    setCouncilLoading(false);
    setCouncilSynthLoading(false);
  };

  const filteredConvs = conversations.filter(c => (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()));
  const personaConf = activeConv?.isPersona ? [...PROFESSIONAL_PERSONAS, ...HISTORICAL_AVATARS, ...FICTIONAL_PERSONAS].find(p => p.id === activeConv.personaId) : null;

  const renderInputArea = (compact = false) => (
    <div className={compact ? "chat-input-wrap" : "empty-input-container"}>
      {!compact && !activeConv?.isPersona && (
        <div className="mansh-toggle">
          <div className={`mtoggle-opt ${model.id === "auto/mansh" ? "active" : ""}`} onClick={() => setModel(MODELS[0])}>✨ Mansh Mode</div>
          <div className={`mtoggle-opt ${model.id !== "auto/mansh" ? "active" : ""}`} onClick={() => setModel(MODELS[2])}>Standard</div>
        </div>
      )}
      {shadowMode && (
        <div className="shadow-banner">
          <span>👹</span>
          <span>Shadow Mode is ON — The AI will challenge everything you say</span>
          <button onClick={() => setShadowMode(false)}>Deactivate</button>
        </div>
      )}
      {image && (
        <div className="img-chip">
          {image}
          <button onClick={() => { setImage(null); setImageBase64(null); if (fileRef.current) fileRef.current.value = ""; }} className="img-chip-rm">✕</button>
        </div>
      )}
      <div className={`input-pill ${shadowMode ? "shadow-pill" : ""}`}>
        <textarea
          ref={textareaRef}
          className="input-ta"
          placeholder={shadowMode ? "State your belief... I'll find its weakness." : (activeConv?.isPersona ? `Message ${activeConv.title.replace("Chat with ", "")}...` : "Ask me anything...")}
          value={input}
          onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          rows={1}
        />
        <div className="input-actions">
          {model.vision && (
            <button className="input-icon-btn" onClick={() => fileRef.current?.click()} title="Attach image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
          )}
          {/* FIX: use arrow function to prevent event object being passed as overrideInput */}
          <button className="send-btn" onClick={() => sendMessage()} disabled={(!input.trim() && !imageBase64) || loading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
      </div>
      {!compact && (
        <div className="quick-actions">
          <button className="qa-chip" onClick={enhancePrompt} disabled={enhancing || !input.trim()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            {enhancing ? "Enhancing..." : "Enhance Prompt"}
          </button>
          <button className="qa-chip" onClick={() => { const m = MODELS.find(m => m.label === "Cornea 1.0"); if (m) setModel(m); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Analyze Image
          </button>
          <button className={`qa-chip ${shadowMode ? "qa-chip-active-red" : ""}`} onClick={() => setShadowMode(p => !p)}>
            👹 {shadowMode ? "Shadow: ON" : "Shadow Mode"}
          </button>
        </div>
      )}
      {compact && (
        <div className="compact-quick-actions">
          <button className="qa-chip" onClick={enhancePrompt} disabled={enhancing || !input.trim()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            {enhancing ? "..." : "Enhance"}
          </button>
          <button className={`qa-chip ${shadowMode ? "qa-chip-active-red" : ""}`} onClick={() => setShadowMode(p => !p)}>
            👹 {shadowMode ? "Shadow: ON" : "Shadow"}
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile}/>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{height:100%;background:#000;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        ::selection{background:#3d1f8a;color:#fff;}

        /* ── ATMOSPHERE CSS VARS ── */
        :root{
          --atm-accent: ${atm.accent};
          --atm-glow: ${atm.glow};
          --atm-star-dur: ${atm.starDur};
        }

        /* ── STARFIELD ── */
        @keyframes twinkle{0%,100%{opacity:0.2}50%{opacity:1}}
        .starfield{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
        .star{position:absolute;border-radius:50%;background:#fff;animation:twinkle linear infinite;}

        /* ── LAYOUT ── */
        .root{display:flex;height:100vh;width:100vw;overflow:hidden;position:relative;z-index:1;}

        /* ── SIDEBAR ── */
        .sb{
          width:264px;flex-shrink:0;
          background:rgba(5,5,8,0.92);
          backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
          border-right:1px solid rgba(255,255,255,0.07);
          display:flex;flex-direction:column;overflow:hidden;
          transition:width 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s cubic-bezier(0.4,0,0.2,1),transform 0.3s cubic-bezier(0.4,0,0.2,1);
          z-index:50;will-change:transform;
        }
        .sb.off{width:0;opacity:0;pointer-events:none;}

        @media(max-width:800px){
          .sb{
            position:fixed;top:0;left:0;bottom:0;
            width:280px !important;z-index:200;
            transform:translateX(-100%);opacity:1 !important;
            border-right:1px solid rgba(255,255,255,0.1);
            box-shadow:4px 0 40px rgba(0,0,0,0.8);
          }
          .sb.off{transform:translateX(-100%);pointer-events:none;}
          .sb:not(.off){transform:translateX(0);}
        }

        /* ── SIDEBAR BACKDROP ── */
        .sb-backdrop{display:none;}
        @media(max-width:800px){
          .sb-backdrop{
            display:block;position:fixed;inset:0;
            background:rgba(0,0,0,0.65);
            backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
            z-index:199;opacity:0;pointer-events:none;
            transition:opacity 0.3s cubic-bezier(0.4,0,0.2,1);
          }
          .sb-backdrop.visible{opacity:1;pointer-events:auto;}
        }

        .sb-head{padding:20px 16px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .sb-mark{width:30px;height:30px;background:linear-gradient(135deg,var(--atm-accent),#5c3dcc);border-radius:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px var(--atm-glow);flex-shrink:0;transition:background 0.6s,box-shadow 0.6s;}
        .sb-title{font-size:15px;font-weight:600;color:#fff;white-space:nowrap;}
        .sb-body{flex:1;overflow-y:auto;padding:12px 10px;}
        .sb-search{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:9px 13px;font-size:13px;color:#ccc;outline:none;font-family:'Inter';margin-bottom:8px;transition:border-color 0.2s;}
        .sb-search:focus{border-color:rgba(255,255,255,0.14);}
        .sb-search::placeholder{color:#444;}
        .sb-section{font-size:10.5px;color:#383838;text-transform:uppercase;letter-spacing:0.9px;font-weight:600;padding:14px 6px 6px;}
        .sb-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;color:#666;font-size:13.5px;font-weight:500;transition:all 0.15s;margin-bottom:2px;border:1px solid transparent;}
        .sb-item:hover{background:rgba(255,255,255,0.04);color:#bbb;border-color:rgba(255,255,255,0.06);}
        .sb-item.active{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.09);}
        .sb-conv{padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:2px;border:1px solid transparent;position:relative;transition:all 0.15s;}
        .sb-conv:hover{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.06);}
        .sb-conv.active{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.08);}
        .sb-conv-title{font-size:13px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:24px;line-height:1.4;}
        .sb-conv.active .sb-conv-title{color:#fff;}
        .sb-conv-sub{font-size:10.5px;color:#444;margin-top:3px;}
        .sb-del{position:absolute;right:8px;top:10px;opacity:0;background:none;border:none;color:#555;cursor:pointer;font-size:13px;transition:0.15s;padding:2px 4px;}
        .sb-conv:hover .sb-del{opacity:1;}
        .sb-del:hover{color:#fca5a5;}
        .sb-foot{padding:14px 10px;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
        .sb-user{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;transition:0.15s;}
        .sb-user:hover{background:rgba(255,255,255,0.04);}
        .sb-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#3d1f8a,#1a0d2e);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden;}
        .sb-av img{width:100%;height:100%;object-fit:cover;}
        .sb-uinfo{flex:1;min-width:0;}
        .sb-uname{font-size:13px;font-weight:500;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sb-badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;color:#a78bfa;background:#0d081f;border:1px solid #2d1f60;border-radius:5px;padding:2px 7px;margin-top:3px;font-weight:600;}
        .sb-plan{font-size:10px;color:#555;margin-top:2px;}
        .sb-progress{height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin:6px 0;overflow:hidden;}
        .sb-progress-fill{height:100%;background:var(--atm-accent);border-radius:2px;transition:width 0.4s,background 0.6s;}
        .sb-upg{width:100%;background:transparent;border:1px solid rgba(255,255,255,0.09);border-radius:8px;color:#bbb;font-size:12px;font-weight:500;padding:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter';transition:0.15s;margin-bottom:10px;}
        .sb-upg:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.16);color:#fff;}

        /* ── MAIN ── */
        .main{flex:1;min-width:0;display:flex;flex-direction:column;background:transparent;position:relative;}

        /* ── TOPBAR — FIX: z-index above mobile backdrop (199) ── */
        .topbar{
          display:flex;align-items:center;gap:14px;
          padding:14px 20px;
          border-bottom:1px solid rgba(255,255,255,0.05);
          flex-shrink:0;position:relative;
          z-index:210; /* FIX: above sb-backdrop(199) and sb(200) on mobile */
          background: rgba(10,10,18,0.96);
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
          min-height:60px;
        @media(max-width:800px){
  .topbar{
    padding:14px 16px;
    gap:10px;
    position: sticky;
    top: 0;
    z-index: 210;
    background: rgba(8,8,16,0.98);
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
}
        }
        .icon-btn{background:transparent;border:none;color:#888;cursor:pointer;padding:8px;border-radius:8px;display:flex;align-items:center;transition:0.2s;}
        .icon-btn:hover{color:#fff;background:rgba(255,255,255,0.06);}
        .icon-btn.active{color:#fff;background:rgba(255,255,255,0.08);}
        .icon-btn.shadow-on{color:#f97316;background:rgba(249,115,22,0.1);}
        .mdrop-wrap{position:relative;}
        .mdrop-btn{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:8px 16px;font-size:13.5px;color:#ddd;cursor:pointer;transition:0.2s;font-weight:500;font-family:'Inter';}
        .mdrop-btn:hover{background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.16);}
        .mdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .mdrop-menu{position:absolute;top:calc(100%+10px);left:0;background:rgba(8,8,12,0.98);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:8px;min-width:290px;z-index:400;box-shadow:0 16px 48px rgba(0,0,0,0.8);}
        .mdrop-item{padding:12px 14px;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:0.15s;}
        .mdrop-item:hover{background:rgba(255,255,255,0.05);}
        .mdrop-item.sel{background:rgba(255,255,255,0.06);}
        .mdrop-name{font-size:14px;font-weight:600;color:#fff;}
        .mdrop-desc{font-size:11.5px;color:#666;margin-top:2px;}
        .mdrop-divider{height:1px;background:rgba(255,255,255,0.05);margin:4px 0;}
        .topbar-right{margin-left:auto;display:flex;align-items:center;gap:6px;}

        /* ── ATM INDICATOR (topbar) ── */
        .atm-dot{width:7px;height:7px;border-radius:50%;background:var(--atm-accent);box-shadow:0 0 6px var(--atm-glow);transition:background 0.6s,box-shadow 0.6s;flex-shrink:0;}

        /* ── ERROR BAR ── */
        .err-bar{padding:0 24px 12px;}
        .err-inner{max-width:800px;margin:0 auto;background:rgba(255,50,50,0.07);border:1px solid rgba(255,80,80,0.2);border-radius:12px;padding:12px 18px;color:#fca5a5;font-size:13.5px;display:flex;align-items:center;gap:10px;}

        /* ── EMAIL VERIFY BANNER ── */
        .verify-banner{
          background:rgba(250,204,21,0.07);
          border-bottom:1px solid rgba(250,204,21,0.2);
          padding:10px 24px;
          display:flex;align-items:center;gap:12px;
          font-size:13px;color:#fbbf24;
          flex-shrink:0;
        }
        .verify-btn{background:rgba(250,204,21,0.12);border:1px solid rgba(250,204,21,0.3);border-radius:7px;padding:5px 14px;font-size:12px;font-weight:600;color:#fbbf24;cursor:pointer;font-family:'Inter';transition:0.15s;white-space:nowrap;}
        .verify-btn:hover{background:rgba(250,204,21,0.2);}
        .verify-close{margin-left:auto;background:none;border:none;color:#666;cursor:pointer;font-size:18px;line-height:1;}

        /* ── GALLERY VIEWS ── */
        .gallery{flex:1;overflow-y:auto;padding:48px 24px;}
        .gallery-inner{max-width:1040px;margin:0 auto;}
        .gallery-header{text-align:center;margin-bottom:48px;}
        .gallery-title{font-size:36px;font-weight:700;color:#fff;letter-spacing:-1px;margin-bottom:12px;}
        .gallery-sub{font-size:16px;color:#555;}
        .persona-tabs{display:flex;gap:6px;justify-content:center;margin-bottom:36px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:6px;width:fit-content;margin-left:auto;margin-right:auto;flex-wrap:wrap;}
        .ptab{padding:10px 24px;border-radius:8px;font-size:13.5px;font-weight:600;color:#555;cursor:pointer;transition:0.2s;border:1px solid transparent;font-family:'Inter';}
        .ptab:hover{color:#bbb;}
        .ptab.active{background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.1);}
        .av-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;}
        .av-card{background:rgba(10,10,15,0.7);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.07);border-radius:20px;overflow:hidden;cursor:pointer;transition:all 0.3s;}
        .av-card:hover{transform:translateY(-5px);border-color:rgba(255,255,255,0.18);box-shadow:0 12px 40px rgba(0,0,0,0.5);}
        .av-img{width:100%;aspect-ratio:1;object-fit:cover;display:block;border-bottom:1px solid rgba(255,255,255,0.05);}
        .av-fallback{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:44px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.05);}
        .av-info{padding:16px;}
        .av-name{font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;}
        .av-sub{font-size:11.5px;color:#666;line-height:1.4;}
        .pro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;}
        @media(max-width:640px){.pro-grid{grid-template-columns:1fr;}}
        .pro-card{background:rgba(10,10,15,0.7);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:20px;display:flex;align-items:center;gap:20px;cursor:pointer;transition:all 0.3s;}
        .pro-card:hover{background:rgba(18,18,26,0.9);border-color:rgba(255,255,255,0.15);transform:translateY(-3px);}
        .pro-img-wrap{width:80px;height:80px;border-radius:16px;overflow:hidden;flex-shrink:0;position:relative;}
        .pro-img{width:100%;height:100%;object-fit:cover;}
        .pro-info{flex:1;min-width:0;}
        .pro-tag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;}
        .pro-name{font-size:17px;font-weight:600;color:#fff;margin-bottom:6px;}
        .pro-desc{font-size:13px;color:#666;line-height:1.5;}

        /* ── COUNCIL OF MINDS ── */
        .council-wrap{flex:1;overflow-y:auto;padding:40px 24px;}
        .council-inner{max-width:860px;margin:0 auto;}
        .council-header{text-align:center;margin-bottom:40px;}
        .council-title{font-size:30px;font-weight:700;color:#fff;letter-spacing:-0.8px;margin-bottom:8px;}
        .council-sub{font-size:15px;color:#555;line-height:1.6;}
        .council-input-wrap{background:rgba(10,10,15,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:20px;margin-bottom:32px;}
        .council-ta{width:100%;background:transparent;border:none;outline:none;color:#fff;font-size:15px;font-family:'Inter';resize:none;line-height:1.65;min-height:80px;max-height:200px;}
        .council-ta::placeholder{color:#333;}
        .council-actions{display:flex;align-items:center;justify-content:flex-end;margin-top:14px;gap:10px;}
        .council-btn{background:#fff;color:#000;border:none;border-radius:12px;padding:11px 28px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter';transition:opacity 0.2s;display:flex;align-items:center;gap:8px;}
        .council-btn:hover:not(:disabled){opacity:0.88;}
        .council-btn:disabled{opacity:0.4;cursor:not-allowed;}
        .council-results{display:flex;flex-direction:column;gap:16px;}
        .council-card{background:rgba(10,10,15,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;animation:slideIn 0.3s ease;}
        .council-card-head{display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.05);}
        .council-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
        .council-card-name{font-size:14px;font-weight:700;color:#fff;}
        .council-card-label{font-size:11px;color:#555;margin-top:2px;}
        .council-card-body{padding:18px 20px;font-size:14.5px;color:#9aa0b0;line-height:1.8;}
        .council-synthesis{background:rgba(124,92,252,0.06);border:1px solid rgba(124,92,252,0.25);border-radius:18px;padding:24px;margin-top:8px;}
        .council-synth-label{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--atm-accent);margin-bottom:12px;}
        .council-synth-body{font-size:15px;color:#d0c8ff;line-height:1.8;}
        .council-loading{display:flex;align-items:center;gap:12px;padding:20px;color:#555;font-size:13.5px;}
        @keyframes slideIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}

        /* ── EMPTY STATE ── */
        .empty-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;}
        .empty-input-container{width:100%;max-width:780px;}
        .mansh-toggle{display:flex;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:99px;width:fit-content;margin:0 auto 28px;padding:4px;}
        .mtoggle-opt{padding:9px 22px;border-radius:99px;font-size:13.5px;font-weight:600;color:#555;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:8px;font-family:'Inter';}
        .mtoggle-opt.active{background:rgba(255,255,255,0.09);color:#fff;border:1px solid rgba(255,255,255,0.09);}
        .input-pill{background:rgba(10,10,15,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.11);border-radius:24px;padding:14px 18px;display:flex;align-items:flex-end;gap:12px;transition:all 0.25s;box-shadow:0 8px 32px rgba(0,0,0,0.4);}
        .input-pill:focus-within{border-color:rgba(255,255,255,0.24);box-shadow:0 8px 32px var(--atm-glow);}
        .input-pill.shadow-pill{border-color:rgba(249,115,22,0.35);box-shadow:0 8px 32px rgba(249,115,22,0.12);}
        .input-pill.shadow-pill:focus-within{border-color:rgba(249,115,22,0.6);box-shadow:0 8px 32px rgba(249,115,22,0.2);}
        .input-ta{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:15px;font-family:'Inter';resize:none;max-height:200px;line-height:1.6;min-height:24px;}
        .input-ta::placeholder{color:#333;}
        .input-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}
        .input-icon-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:9px;padding:9px;color:#888;cursor:pointer;transition:0.2s;display:flex;}
        .input-icon-btn:hover{background:rgba(255,255,255,0.1);color:#fff;}
        .send-btn{width:38px;height:38px;background:#fff;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;color:#000;}
        .send-btn:hover:not(:disabled){transform:scale(1.08);box-shadow:0 4px 16px rgba(255,255,255,0.2);}
        .send-btn:disabled{background:rgba(255,255,255,0.08);color:#444;cursor:not-allowed;}
        .img-chip{display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);border-radius:10px;font-size:12.5px;color:#bbb;margin-bottom:10px;width:fit-content;}
        .img-chip-rm{background:none;border:none;color:#888;cursor:pointer;font-size:13px;transition:0.15s;}
        .img-chip-rm:hover{color:#fca5a5;}
        .quick-actions{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap;}
        .compact-quick-actions{display:flex;gap:8px;justify-content:flex-start;margin-top:10px;padding:0 2px;flex-wrap:wrap;}
        .qa-chip{background:rgba(10,10,15,0.7);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.09);border-radius:99px;padding:10px 20px;font-size:12.5px;color:#888;cursor:pointer;display:flex;align-items:center;gap:8px;transition:0.2s;font-weight:500;font-family:'Inter';}
        .qa-chip:hover{background:rgba(255,255,255,0.06);color:#fff;border-color:rgba(255,255,255,0.16);}
        .qa-chip:disabled{opacity:0.5;cursor:not-allowed;}
        .qa-chip-active-red{color:#f97316;border-color:rgba(249,115,22,0.4);background:rgba(249,115,22,0.07);}
        .qa-chip-active-red:hover{background:rgba(249,115,22,0.12);color:#fb923c;}

        /* ── SHADOW MODE BANNER ── */
        .shadow-banner{
          display:flex;align-items:center;gap:10px;
          padding:10px 16px;
          background:rgba(249,115,22,0.07);
          border:1px solid rgba(249,115,22,0.25);
          border-radius:12px;
          font-size:13px;color:#f97316;
          margin-bottom:10px;
        }
        .shadow-banner button{margin-left:auto;background:rgba(249,115,22,0.12);border:1px solid rgba(249,115,22,0.3);border-radius:7px;padding:4px 12px;font-size:11.5px;color:#f97316;cursor:pointer;font-family:'Inter';font-weight:600;white-space:nowrap;}

        /* ── MESSAGES ── */
        .msgs-wrap{flex:1;overflow-y:auto;padding:20px 0;}
        .msgs-inner{max-width:820px;margin:0 auto;padding:0 24px;}
        .msg{margin-bottom:28px;}
        .msg-head{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
        .msg-av{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;}
        .msg-name{font-size:14px;font-weight:600;color:#ccc;}
        .msg-body{font-size:15px;line-height:1.82;color:#b0b8c8;padding-left:40px;}
        .msg-body.user{color:#d8dce8;}
        .msg-body p{margin-bottom:10px;}
        .msg-body p:last-child{margin-bottom:0;}
        .msg-body code{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09);border-radius:5px;padding:2px 7px;font-size:13px;color:#a78bfa;font-family:monospace;}
        .msg-body pre{background:rgba(10,10,15,0.9);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px;overflow-x:auto;margin:0;}
        .msg-body pre code{background:none;border:none;padding:0;color:#c8d0e0;font-size:13.5px;}
        .msg-body h1,.msg-body h2,.msg-body h3{color:#eee;font-weight:600;margin:20px 0 8px;}
        .msg-body h1{font-size:20px;}.msg-body h2{font-size:17px;}.msg-body h3{font-size:15px;}
        .msg-body ul,.msg-body ol{padding-left:24px;margin-bottom:10px;}
        .msg-body li{margin-bottom:5px;color:#9aa0b0;}
        .msg-body strong{color:#d8dce8;font-weight:600;}
        .msg-body table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px;}
        .msg-body th{padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
        .msg-body td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);color:#9aa0b0;}
        .msg-body .katex{color:#c8b8ff;font-size:1em;}
        .msg-body .katex-display{margin:16px 0;}
        .think-summary{font-size:11.5px;color:#444;cursor:pointer;padding:6px 12px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;display:inline-flex;align-items:center;gap:7px;margin-bottom:12px;list-style:none;transition:0.15s;}
        .think-summary:hover{border-color:rgba(255,255,255,0.12);color:#777;}
        .think-body{padding:12px 16px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-left:2px solid rgba(255,255,255,0.1);border-radius:10px;font-size:13px;color:#444;line-height:1.7;font-style:italic;margin-top:8px;margin-bottom:12px;}
        .routing-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(250,204,21,0.06);border:1px solid rgba(250,204,21,0.2);border-radius:10px;color:#fbbf24;font-size:13px;font-style:italic;margin-bottom:24px;margin-left:40px;flex-wrap:wrap;}
        .msg-cursor{display:inline-block;width:2px;height:1.1em;background:#a78bfa;animation:blink 1s infinite;margin-left:2px;vertical-align:text-bottom;}
        .msg-actions{display:flex;gap:6px;padding-left:40px;margin-top:8px;opacity:0;transition:0.2s;}
        .msg:hover .msg-actions{opacity:1;}
        .act-btn{background:transparent;border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:4px 11px;font-size:11.5px;color:#555;cursor:pointer;font-family:'Inter';transition:0.15s;}
        .act-btn:hover{border-color:rgba(255,255,255,0.15);color:#bbb;}
        .act-btn.ok{color:#4ade80;border-color:rgba(74,222,128,0.3);}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        .typing-wrap{padding-left:40px;display:flex;gap:5px;align-items:center;padding-top:4px;}
        .t-dot{width:5px;height:5px;border-radius:50%;background:#444;animation:bounce 1.4s infinite;}
        .t-dot:nth-child(2){animation-delay:0.15s;}
        .t-dot:nth-child(3){animation-delay:0.3s;}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-7px);background:#666;}}

        /* ── CHAT INPUT BOTTOM ── */
        .chat-input-wrap{padding:0 24px 28px;flex-shrink:0;}

        /* ── OVERLAYS ── */
        .overlay{position:fixed;inset:0;background:rgba(0,0,5,0.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;z-index:600;padding:20px;}
        @keyframes dlg{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        .modal{background:rgba(8,8,14,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:36px;max-width:600px;width:100%;animation:dlg 0.25s cubic-bezier(0.16,1,0.3,1);max-height:90vh;overflow-y:auto;}
        .modal::-webkit-scrollbar{width:4px;}
        .modal::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        .modal-title{font-size:24px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-0.5px;}
        .modal-sub{font-size:14px;color:#555;margin-bottom:28px;line-height:1.6;}
        .form-grid{display:flex;flex-wrap:wrap;gap:14px;}
        .form-group{display:flex;flex-direction:column;gap:6px;}
        .form-label{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;}
        .form-input{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 15px;color:#fff;font-size:14px;outline:none;font-family:'Inter';transition:border-color 0.2s;}
        .form-input:focus{border-color:rgba(108,71,255,0.6);}
        .form-input::placeholder{color:#333;}
        .form-select{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
        .form-btns{display:flex;gap:10px;margin-top:28px;}
        .btn-primary{flex:2;background:#fff;color:#000;border:none;border-radius:12px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter';transition:opacity 0.2s;}
        .btn-primary:hover{opacity:0.9;}
        .btn-secondary{flex:1;background:transparent;color:#666;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;font-size:14px;cursor:pointer;font-family:'Inter';transition:all 0.2s;}
        .btn-secondary:hover{border-color:rgba(255,255,255,0.2);color:#bbb;}

        /* ── UPGRADE MODAL ── */
        .upg-modal{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:28px;padding:48px;max-width:820px;width:100%;animation:dlg 0.25s cubic-bezier(0.16,1,0.3,1);position:relative;}
        .upg-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        @media(max-width:600px){.upg-grid{grid-template-columns:1fr;}}
        .upg-card{background:rgba(16,16,22,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:36px 28px;display:flex;flex-direction:column;gap:0;}
        .upg-card.hl{background:rgba(22,12,44,0.8);border-color:rgba(124,92,252,0.4);}
        .upg-price{font-size:44px;font-weight:700;color:#fff;margin-bottom:4px;}
        .upg-period{font-size:15px;color:#555;}
        .upg-features{margin:24px 0;display:flex;flex-direction:column;gap:12px;flex:1;}
        .upg-feat{display:flex;align-items:center;gap:10px;font-size:14px;color:#ccc;}
        .upg-check{font-size:14px;color:#4ade80;}
        .upg-check.purple{color:#a78bfa;}
        .upg-btn{width:100%;padding:15px;border:none;border-radius:12px;background:#fff;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter';transition:opacity 0.2s;margin-top:auto;}
        .upg-btn:hover{opacity:0.88;}
        .upg-btn.purple{background:#a78bfa;color:#000;}
        .upg-note{text-align:center;font-size:11.5px;color:#333;margin-top:20px;}

        /* ── CONFIRM DIALOG ── */
        .dlg{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:380px;width:100%;animation:dlg 0.2s cubic-bezier(0.16,1,0.3,1);}
        .dlg h3{font-size:16px;font-weight:600;color:#eee;margin-bottom:8px;}
        .dlg p{font-size:13.5px;color:#555;line-height:1.6;margin-bottom:22px;}
        .dlg-btns{display:flex;gap:8px;justify-content:flex-end;}
        .dlg-cancel{background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:9px 16px;font-size:13px;color:#555;cursor:pointer;font-family:'Inter';transition:all 0.15s;}
        .dlg-cancel:hover{color:#bbb;border-color:rgba(255,255,255,0.15);}
        .dlg-del{background:#7f1d1d;border:none;border-radius:9px;padding:9px 16px;font-size:13px;color:#fca5a5;cursor:pointer;font-family:'Inter';font-weight:600;transition:0.15s;}
        .dlg-del:hover{background:#991b1b;}

        /* ── PROMPT EDITOR ── */
        .pe-modal{background:rgba(8,8,14,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;max-width:540px;width:100%;animation:dlg 0.2s cubic-bezier(0.16,1,0.3,1);}
        .pe-ta{width:100%;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;font-size:13.5px;font-family:'Inter';color:#ccc;outline:none;resize:vertical;min-height:180px;line-height:1.65;transition:border-color 0.2s;}
        .pe-ta:focus{border-color:rgba(108,71,255,0.5);}
        .pe-ta::placeholder{color:#282828;}

        @media(max-width:800px){
          .msgs-inner{padding:0 16px;}
          .chat-input-wrap{padding:0 16px 24px;}
          .topbar{gap:10px;}
          .mdrop-btn{padding:7px 12px;font-size:13px;}
          .gallery{padding:32px 16px;}
          .gallery-title{font-size:26px;}
          .ptab{padding:8px 16px;font-size:12.5px;}
          .upg-modal{padding:28px 20px;}
          .council-wrap{padding:24px 16px;}
        }
      `}</style>

      {/* — STARFIELD — */}
      <div className="starfield">
        {STARS.map(s=><div key={s.id} className="star" style={{left:s.left,top:s.top,width:s.w,height:s.w,animationDuration:`${parseFloat(s.dur) * parseFloat(atm.starDur)}s`,animationDelay:s.delay,opacity:s.op}}/>)}
      </div>

      {/* — DELETE CONFIRM — */}
      {deleteConfirm && (
        <div className="overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="dlg" onClick={e => e.stopPropagation()}>
            <h3>Delete conversation?</h3>
            <p>"{deleteConfirm.title}" will be permanently deleted.</p>
            <div className="dlg-btns">
              <button className="dlg-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="dlg-del" onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PERSONA ONBOARDING ── */}
      {onboardingPersona && onboardingPersona.fields?.length > 0 && (
        <div className="overlay" onClick={() => setOnboardingPersona(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{onboardingPersona.icon || "✨"} {onboardingPersona.label}</div>
            <div className="modal-sub">{onboardingPersona.desc}</div>
            <div className="form-grid">
              {onboardingPersona.fields.map(f => (
                <div key={f.id} className="form-group" style={{ width: f.width === "half" ? "calc(50% - 7px)" : "100%" }}>
                  <label className="form-label">{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea className="form-input" rows={3} placeholder={f.placeholder || ""} value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})} style={{resize:"vertical"}}/>
                  ) : f.type === "select" ? (
                    <select className="form-input form-select" value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})}>
                      <option value="" disabled>Select...</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="form-input" type="text" placeholder={f.placeholder||""} value={personaFormData[f.id]||""} onChange={e => setPersonaFormData({...personaFormData,[f.id]:e.target.value})}/>
                  )}
                </div>
              ))}
            </div>
            <div className="form-btns">
              <button className="btn-secondary" onClick={() => setOnboardingPersona(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => startPersonaChat(onboardingPersona, personaFormData)}>Begin Session →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPGRADE MODAL ── */}
      {showUpgrade && (
        <div className="overlay" onClick={() => { if (!paidConfirmed) setShowUpgrade(false); }}>
          <div className="upg-modal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowUpgrade(false)} style={{ position:"absolute", top:"20px", right:"24px", background:"none", border:"none", color:"#555", fontSize:"24px", cursor:"pointer" }}>×</button>
            {paidConfirmed ? (
              <div style={{ textAlign:"center", padding:"32px 0" }}>
                <div style={{ fontSize:"56px", marginBottom:"20px" }}>✅</div>
                <div style={{ fontSize:"24px", fontWeight:700, color:"#4ade80", marginBottom:"12px" }}>Request Sent</div>
                <div style={{ fontSize:"14px", color:"#555", lineHeight:1.8, maxWidth:"460px", margin:"0 auto" }}>Your upgrade request is now visible in the creator dashboard.<br/>Send the payment screenshot to <span style={{color:"#fff"}}>{SUPPORT_EMAIL}</span> from your registered email.</div>
                <button className="btn-primary" style={{ maxWidth:"200px", margin:"32px auto 0" }} onClick={() => { setShowUpgrade(false); setPaidConfirmed(false); }}>Got it</button>
              </div>
            ) : (
              <>
                <div style={{ textAlign:"center", marginBottom:"36px" }}>
                  <div style={{ fontSize:"28px", fontWeight:700, color:"#fff", marginBottom:"8px" }}>Upgrade Manshverse</div>
                  <div style={{ fontSize:"14px", color:"#555" }}>Unlock higher limits and premium features</div>
                </div>
                <div className="upg-grid">
                  <div className="upg-card">
                    <div className="upg-price">₹199<span className="upg-period">/mo</span></div>
                    <div style={{ color:"#555", fontSize:"12px", marginBottom:"20px" }}>Monthly billing</div>
                    <div className="upg-features">
                      <div className="upg-feat"><span className="upg-check">✓</span> 40 Astral msgs/day</div>
                      <div className="upg-feat"><span className="upg-check">✓</span> 15 Milkcake msgs/day</div>
                      <div className="upg-feat"><span className="upg-check">✓</span> Mansh Mode access</div>
                      <div className="upg-feat"><span className="upg-check">✓</span> All personas unlocked</div>
                    </div>
                    <button className="upg-btn" onClick={() => submitUpgrade("pro")} disabled={submitting}>{submitting ? "Sending..." : "Get Monthly Plan"}</button>
                  </div>
                  <div className="upg-card hl">
                    <div className="upg-price">₹1,999<span className="upg-period">/yr</span></div>
                    <div style={{ color:"#a78bfa", fontSize:"12px", fontWeight:600, marginBottom:"20px" }}>Save ₹389 — Best Value</div>
                    <div className="upg-features">
                      <div className="upg-feat"><span className="upg-check purple">✓</span> Unlimited Astral & Impulse</div>
                      <div className="upg-feat"><span className="upg-check purple">✓</span> 75 Milkcake msgs/day</div>
                      <div className="upg-feat"><span className="upg-check purple">✓</span> Priority on all models</div>
                      <div className="upg-feat"><span className="upg-check purple">✓</span> Free future model upgrades</div>
                    </div>
                    <button className="upg-btn purple" onClick={() => submitUpgrade("ultra")} disabled={submitting}>{submitting ? "Sending..." : "Get Yearly Plan"}</button>
                  </div>
                </div>
                <div className="upg-note">UPI ID: <span style={{color:"#888"}}>{UPI_ID}</span> · Send payment then click upgrade · We activate within a few hours</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── PROMPT EDITOR ── */}
      {showPromptEditor && isCreator && (
        <div className="overlay" onClick={() => setShowPromptEditor(false)}>
          <div className="pe-modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:"16px", fontWeight:600, color:"#ddd", marginBottom:"6px" }}>Custom System Prompt</div>
            <div style={{ fontSize:"13px", color:"#555", marginBottom:"14px" }}>Override the session system prompt. Leave empty to use default.</div>
            <textarea className="pe-ta" placeholder="Enter custom system prompt..." value={promptDraft} onChange={e => setPromptDraft(e.target.value)}/>
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", marginTop:"14px" }}>
              <button className="btn-secondary" style={{ flex:"none" }} onClick={() => { setPromptDraft(""); setCustomPrompt(""); setShowPromptEditor(false); }}>Reset</button>
              <button className="btn-secondary" style={{ flex:"none" }} onClick={() => setShowPromptEditor(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex:"none" }} onClick={() => { setCustomPrompt(promptDraft); setShowPromptEditor(false); }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BAN / MAINTENANCE BANNER ── */}
      {(isBanned || (maintenanceMode && !isCreator)) && (
        <div style={{
          position:'fixed',top:0,left:0,right:0,zIndex:9999,
          background:'#7f1d1d',color:'#fca5a5',padding:'12px',
          textAlign:'center',fontSize:'13px',fontWeight:'bold',borderBottom:'1px solid #991b1b'
        }}>
          {isBanned ? "⚠️ Suspicious activity detected. Your access to Manshverse has been revoked." : `🛠️ Maintenance Mode: ${platformNotice || "System upgrades in progress."}`}
        </div>
      )}

      {/* ── APP ROOT ── */}
      <div className="root">

        {/* ── SIDEBAR BACKDROP ── */}
        <div className={`sb-backdrop ${sidebarOpen && isMobile ? "visible" : ""}`} onClick={() => setSidebarOpen(false)}/>

        {/* ── SIDEBAR ── */}
        <div className={`sb ${sidebarOpen ? "" : "off"}`}>
          <div className="sb-head">
            <div className="sb-mark">{MV_ICON(16, "#fff")}</div>
            <div className="sb-title">Manshverse</div>
            {isMobile && (
              <button onClick={() => setSidebarOpen(false)} style={{ marginLeft:"auto", background:"none", border:"none", color:"#555", fontSize:"20px", cursor:"pointer", padding:"4px", lineHeight:1 }}>×</button>
            )}
          </div>
          <div className="sb-body">
            <input className="sb-search" placeholder="Search conversations..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
            <div className={`sb-item ${view === "chat" && !messages.length && !activeConv ? "active" : ""}`} onClick={() => newChat()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              New Chat
            </div>
            <div className="sb-section">Explore</div>
            <div className={`sb-item ${view === "personas" ? "active" : ""}`} onClick={() => setView("personas")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Personas & Avatars
            </div>
            <div className={`sb-item ${view === "council" ? "active" : ""}`} onClick={() => setView("council")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              Council of Minds
            </div>
            <div className="sb-section">Recent</div>
            {filteredConvs.map(conv => (
              <div key={conv.id} className={`sb-conv ${activeConv?.id === conv.id ? "active" : ""}`} onClick={() => selectConv(conv)}>
                <div className="sb-conv-title">{conv.title || "Untitled"}</div>
                <div className="sb-conv-sub">{conv.isPersona ? "● Persona" : conv.model || "—"}</div>
                <button className="sb-del" onClick={e => { e.stopPropagation(); setDeleteConfirm(conv); }}>✕</button>
              </div>
            ))}
          </div>
          <div className="sb-foot">
            {!isCreator && (
              <>
                <button className="sb-upg" onClick={() => setShowUpgrade(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Upgrade Plan
                </button>
                <div style={{ padding:"0 4px 12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#444", marginBottom:"4px" }}>
                    <span>{model.label}</span>
                    <span>{currentUsed}/{currentLimit === Infinity ? "∞" : currentLimit}</span>
                  </div>
                  <div className="sb-progress"><div className="sb-progress-fill" style={{ width:`${usagePct}%` }}/></div>
                </div>
              </>
            )}
            <div className="sb-user" onClick={() => navigate("/profile")}>
              <div className="sb-av">
                {user?.photoURL ? <img src={user.photoURL} alt=""/> : (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="sb-uinfo">
                <div className="sb-uname">{user?.displayName || user?.email}</div>
                {isCreator ? <div className="sb-badge">✦ Creator</div> : <div className="sb-plan">{plan.toUpperCase()}</div>}
              </div>
              <button className="icon-btn" style={{ padding:"6px" }} onClick={e => { e.stopPropagation(); signOut(auth); }} title="Sign out">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div className="main">
          {/* ── TOPBAR — FIX: z-index:210 ensures visibility above mobile backdrop ── */}
          <div className="topbar">
            <button className={`icon-btn ${sidebarOpen && !isMobile ? "active" : ""}`} onClick={() => setSidebarOpen(p => !p)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {view === "chat" && (
              <div className="mdrop-wrap" ref={dropdownRef}>
                <button className="mdrop-btn" onClick={() => setModelDropdown(p => !p)}>
                  {activeConv?.isPersona ? (
                    <><span style={{ fontSize:"16px" }}>{personaConf?.icon || "✨"}</span>{activeConv.title.replace("Chat with ", "")}</>
                  ) : (
                    <><span className="mdot" style={{ background: model.color }}/>{model.label}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft:4}}><polyline points="6 9 12 15 18 9"/></svg></>
                  )}
                </button>
                {modelDropdown && !activeConv?.isPersona && (
                  <div className="mdrop-menu">
                    {MODELS.map((m, i) => (
                      <div key={m.id}>
                        {i === 1 && <div className="mdrop-divider"/>}
                        <div className={`mdrop-item ${model.id === m.id ? "sel" : ""}`} onClick={() => { setModel(m); setModelDropdown(false); }}>
                          <span className="mdot" style={{ background: m.color }}/>
                          <div style={{ flex: 1 }}>
                            <div className="mdrop-name">{m.label} {m.vision && <span style={{fontSize:"10px",color:"#fca5a5",background:"rgba(252,165,165,0.1)",border:"1px solid rgba(252,165,165,0.2)",borderRadius:"4px",padding:"1px 5px",marginLeft:"4px"}}>Vision</span>}</div>
                            <div className="mdrop-desc">{m.desc}</div>
                          </div>
                          {model.id === m.id && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6c47ff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {view === "council" && (
              <div style={{ fontSize:"15px", fontWeight:600, color:"#ddd" }}>⚔️ Council of Minds</div>
            )}
            <div className="topbar-right">
              {/* Atmosphere indicator */}
              <div className="atm-dot" title={`Atmosphere: ${atm.label}`}/>
              {/* Shadow Mode toggle */}
              <button
                className={`icon-btn ${shadowMode ? "shadow-on" : ""}`}
                title={shadowMode ? "Shadow Mode: ON — Click to disable" : "Enable Shadow Mode (Contrarian)"}
                onClick={() => setShadowMode(p => !p)}
              >
                <span style={{ fontSize:"15px", lineHeight:1 }}>👹</span>
              </button>
              {isCreator && (
                <button className="icon-btn" title="Analytics" onClick={() => navigate("/analytics")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </button>
              )}
              {isCreator && (
                <button className="icon-btn" title="System prompt" onClick={() => { setPromptDraft(customPrompt); setShowPromptEditor(true); }} style={{ color: customPrompt ? "var(--atm-accent)" : undefined }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              )}
              <button className="icon-btn" title="Profile" onClick={() => navigate("/profile")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </div>
          </div>

          {/* ── EMAIL VERIFICATION BANNER ── */}
          {showEmailVerify && (
            <div className="verify-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>{verifySent ? "Verification email sent! Check your inbox." : `Please verify your email (${user?.email}) to unlock all features.`}</span>
              {!verifySent && <button className="verify-btn" onClick={sendVerificationEmail}>Send Verification Email</button>}
              <button className="verify-close" onClick={() => setShowEmailVerify(false)}>×</button>
            </div>
          )}

          {error && (
            <div className="err-bar">
              <div className="err-inner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
                <button onClick={() => setError(null)} style={{ marginLeft:"auto", background:"none", border:"none", color:"#fca5a5", cursor:"pointer", fontSize:"16px" }}>✕</button>
              </div>
            </div>
          )}

          {/* ── PERSONAS VIEW ── */}
          {view === "personas" && (
            <div className="gallery">
              <div className="gallery-inner">
                <div className="gallery-header">
                  <div className="gallery-title">Choose a Persona</div>
                  <div className="gallery-sub">Talk to history's greatest minds, expert professionals, or fictional icons.</div>
                </div>
                <div className="persona-tabs">
                  {[{id:"historical",label:"🏛️ Historical"},{id:"professional",label:"💼 Professional"},{id:"fictional",label:"🎭 Fictional"}].map(t => (
                    <button key={t.id} className={`ptab ${personaTab === t.id ? "active" : ""}`} onClick={() => setPersonaTab(t.id)}>{t.label}</button>
                  ))}
                </div>
                {personaTab === "historical" && (
                  <div className="av-grid">
                    {HISTORICAL_AVATARS.map(av => <AvatarCard key={av.id} av={av} onClick={() => startPersonaChat(av, {})}/>)}
                  </div>
                )}
                {personaTab === "professional" && (
                  <div className="pro-grid">
                    {PROFESSIONAL_PERSONAS.map(p => <ProCard key={p.id} p={p} onClick={() => { setOnboardingPersona(p); setPersonaFormData({}); }}/>)}
                  </div>
                )}
                {personaTab === "fictional" && (
                  <div className="av-grid">
                    {FICTIONAL_PERSONAS.map(p => (
                      <AvatarCard key={p.id} av={{ ...p, sub: p.desc }} onClick={() => { if (p.fields?.length > 0) { setOnboardingPersona(p); setPersonaFormData({}); } else startPersonaChat(p, {}); }}/>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COUNCIL OF MINDS VIEW ── */}
          {view === "council" && (
            <div className="council-wrap">
              <div className="council-inner">
                <div className="council-header">
                  <div className="council-title">⚔️ Council of Minds</div>
                  <div className="council-sub">Ask a hard question. Three expert minds debate it — then reach a synthesis verdict.</div>
                </div>

                <div className="council-input-wrap">
                  <textarea
                    className="council-ta"
                    placeholder="e.g. Should I drop out to build my startup? / Is AGI actually dangerous? / What's the best way to learn physics?"
                    value={councilQuestion}
                    onChange={e => setCouncilQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && e.metaKey) runCouncil(); }}
                    rows={3}
                  />
                  <div className="council-actions">
                    <span style={{ fontSize:"12px", color:"#333" }}>⌘↵ to submit</span>
                    <button className="council-btn" onClick={runCouncil} disabled={!councilQuestion.trim() || councilLoading}>
                      {councilLoading ? (
                        <><div className="t-dot"/><div className="t-dot"/><div className="t-dot"/><span style={{marginLeft:6}}>Debating...</span></>
                      ) : (
                        <><span>Summon The Council</span><span>⚔️</span></>
                      )}
                    </button>
                  </div>
                </div>

                {councilResults && (
                  <div className="council-results">
                    {COUNCIL_PERSONAS.map((persona, i) => {
                      const reply = councilResults[persona.id];
                      if (!reply) return null;
                      return (
                        <div className="council-card" key={persona.id} style={{ animationDelay: `${i * 0.1}s` }}>
                          <div className="council-card-head">
                            <div className="council-icon" style={{ background: `${persona.color}18`, border: `1px solid ${persona.color}30` }}>
                              {persona.icon}
                            </div>
                            <div>
                              <div className="council-card-name" style={{ color: persona.color }}>{persona.name}</div>
                              <div className="council-card-label">Council Member</div>
                            </div>
                          </div>
                          <div className="council-card-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{reply}</ReactMarkdown>
                          </div>
                        </div>
                      );
                    })}

                    {councilSynthLoading && !councilResults.synthesis && (
                      <div className="council-synthesis">
                        <div className="council-synth-label">⚡ Synthesizing verdict...</div>
                        <div className="council-loading">
                          <div className="t-dot"/><div className="t-dot"/><div className="t-dot"/>
                          <span>The Council deliberates...</span>
                        </div>
                      </div>
                    )}

                    {councilResults.synthesis && (
                      <div className="council-synthesis">
                        <div className="council-synth-label">⚡ Council Verdict</div>
                        <div className="council-synth-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{councilResults.synthesis}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {councilResults.synthesis && (
                      <div style={{ display:"flex", justifyContent:"center", paddingBottom:"40px" }}>
                        <button className="qa-chip" onClick={() => { setCouncilResults(null); setCouncilQuestion(""); }}>
                          Ask Another Question
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHAT EMPTY STATE ── */}
          {view === "chat" && messages.length === 0 && (
            <div className="empty-wrap">
              {renderInputArea(false)}
            </div>
          )}

          {/* ── ACTIVE CHAT ── */}
          {view === "chat" && messages.length > 0 && (
            <>
              <div className="msgs-wrap" ref={msgsWrapRef}>
                <div className="msgs-inner">
                  {messages.map((msg, i) => {
                    if (msg.type === "routing") return (
                      <div key={i} className="routing-chip">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    );
                    const { thinking, answer } = parseThinking(msg.content);
                    const mm = MODELS.find(m => m.label === msg.modelLabel) || model;
                    return (
                      <div key={i} className="msg">
                        <div className="msg-head">
                          <div className="msg-av" style={msg.role === "user"
                            ? { background:"rgba(255,255,255,0.06)", color:"#ccc", border:"1px solid rgba(255,255,255,0.08)" }
                            : { background: activeConv?.isPersona ? avatarBg(activeConv.title) : "rgba(108,71,255,0.15)", color: activeConv?.isPersona ? "#fff" : "var(--atm-accent)", border: activeConv?.isPersona ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(108,71,255,0.3)" }}>
                            {msg.role === "user"
                              ? (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()
                              : (activeConv?.isPersona ? (personaConf?.icon || "✨") : "M")}
                          </div>
                          <div className="msg-name" style={{ color: msg.role === "user" ? "#888" : (activeConv?.isPersona ? "#fff" : "var(--atm-accent)") }}>
                            {msg.role === "user" ? (user?.displayName || "You") : (activeConv?.isPersona ? activeConv.title.replace("Chat with ", "") : msg.modelLabel)}
                          </div>
                          {/* Shadow Mode badge on AI messages */}
                          {msg.role === "assistant" && shadowMode && (
                            <span style={{ fontSize:"10px", color:"#f97316", background:"rgba(249,115,22,0.1)", border:"1px solid rgba(249,115,22,0.25)", borderRadius:"5px", padding:"2px 7px", marginLeft:"6px" }}>👹 Shadow</span>
                          )}
                        </div>
                        <div className={`msg-body ${msg.role}`}>
                          {thinking && (
                            <details>
                              <summary className="think-summary">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                                View reasoning
                              </summary>
                              <div className="think-body">
                                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>{fixLatex(thinking)}</ReactMarkdown>
                              </div>
                            </details>
                          )}
                          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={MD_COMPONENTS}>
                            {fixLatex(answer || msg.content)}
                          </ReactMarkdown>
                          {msg.streaming && <span className="msg-cursor"/>}
                        </div>
                        {!msg.streaming && (
                          <div className="msg-actions">
                            <button className={`act-btn ${copied === i ? "ok" : ""}`} onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(i); setTimeout(() => setCopied(null), 2000); }}>
                              {copied === i ? "✓ Copied" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {loading && messages[messages.length-1]?.streaming && !messages[messages.length-1]?.content && (
                    <div className="msg">
                      <div className="msg-head">
                        <div className="msg-av" style={{ background:"rgba(108,71,255,0.15)", color:"var(--atm-accent)", border:"1px solid rgba(108,71,255,0.3)" }}>M</div>
                        <div className="msg-name" style={{ color:"var(--atm-accent)" }}>{model.label}</div>
                      </div>
                      <div className="typing-wrap"><div className="t-dot"/><div className="t-dot"/><div className="t-dot"/></div>
                    </div>
                  )}
                  <div ref={bottomRef}/>
                </div>
              </div>
              {renderInputArea(true)}
            </>
          )}
        </div>
      </div>
    </>
  );
}
