import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { User, Country, University, Application, Staff, StorageConfig, Branding, SystemSettings, GlobalScholarship, Conversation, Message, ChatNotification } from "./src/types";

const app = express();
const PORT = 3000;

// Enable large JSON transfers for base64 file uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use("/uploads", express.static(UPLOADS_DIR));

// Simple File-based Database
const DB_FILE = path.join(process.cwd(), "server-db.json");

interface DataBaseSchema {
  users: User[];
  countries: Country[];
  universities: University[];
  applications: Application[];
  staff: Staff[];
  storageConfig: StorageConfig;
  branding: Branding;
  systemSettings: SystemSettings;
  scholarships?: GlobalScholarship[];
  conversations?: Conversation[];
  messages?: Message[];
  chatNotifications?: ChatNotification[];
}

// Seed helper
function loadDB(): DataBaseSchema {
  let dbChanged = false;
  let data: DataBaseSchema;

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      data = JSON.parse(content);
      if (!data.systemSettings) {
        data.systemSettings = {
          disableStudentLogin: false,
          disableStudentRegister: false,
          disableAgentLogin: false,
          disableAgentRegister: false
        };
        dbChanged = true;
      }
    } catch (e) {
      console.error("Error reading database file, using fallback seed data", e);
      data = getFallbackSeed();
      dbChanged = true;
    }
  } else {
    data = getFallbackSeed();
    dbChanged = true;
  }

  // Ensure old demo credentials are removed completely
  const originalCount = data.users.length;
  data.users = data.users.filter(
    (u) => u.email.toLowerCase() !== "admin@globaledu.com" && u.email.toLowerCase() !== "agent@globaledu.com"
  );
  if (data.users.length !== originalCount) {
    dbChanged = true;
  }

  // Ensure primary admin exists
  const hasPrimary = data.users.some((u) => u.email.toLowerCase() === "ftz.edu.consultancy@gmail.com");
  if (!hasPrimary) {
    data.users.push({
      id: "usr-admin-primary",
      email: "ftz.edu.consultancy@gmail.com",
      name: "FTZ Consultancy Primary Admin",
      role: "admin",
      status: "approved",
      avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
      createdAt: new Date().toISOString(),
      password: "farhas@1234"
    });
    dbChanged = true;
  } else {
    const u = data.users.find((u) => u.email.toLowerCase() === "ftz.edu.consultancy@gmail.com");
    if (u && u.password !== "farhas@1234") {
      u.password = "farhas@1234";
      dbChanged = true;
    }
  }

  // Ensure backup admin exists
  const hasBackup = data.users.some((u) => u.email.toLowerCase() === "ftz.edu.backup@gmail.com");
  if (!hasBackup) {
    data.users.push({
      id: "usr-admin-backup",
      email: "ftz.edu.backup@gmail.com",
      name: "FTZ Consultancy Backup Admin",
      role: "admin",
      status: "approved",
      avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
      createdAt: new Date().toISOString(),
      password: "farhas@1234"
    });
    dbChanged = true;
  } else {
    const u = data.users.find((u) => u.email.toLowerCase() === "ftz.edu.backup@gmail.com");
    if (u && u.password !== "farhas@1234") {
      u.password = "farhas@1234";
      dbChanged = true;
    }
  }

  // Ensure country-specific scholarship targets: China & Russia exist in countries list
  if (data.countries) {
    if (!data.countries.some((c) => c.id === "c-cn")) {
      data.countries.push({
        id: "c-cn",
        name: "China",
        imageUrl: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?auto=format&fit=crop&q=80&w=800",
        description: "Fast-developing high-tech industries and extensive fully-funded government programs."
      });
      dbChanged = true;
    }
    if (!data.countries.some((c) => c.id === "c-ru")) {
      data.countries.push({
        id: "c-ru",
        name: "Russia",
        imageUrl: "https://images.unsplash.com/photo-1513326738677-b964603b136d?auto=format&fit=crop&q=80&w=800",
        description: "Elite aeronautical, medical, and scientific state scholarship programs."
      });
      dbChanged = true;
    }
  }

  // Ensure top-level scholarships collection is initialized
  if (!data.scholarships) {
    data.scholarships = [];
    
    // Migrate existing university scholarships
    if (data.universities) {
      data.universities.forEach((u) => {
        if (u.scholarship && u.scholarship.title) {
          data.scholarships!.push({
            id: "sch-" + u.id,
            title: u.scholarship.title,
            description: u.scholarship.description,
            amount: u.scholarship.amount,
            isFullyFunded: !!u.scholarship.isFullyFunded,
            countryId: u.countryId,
            universityId: u.id,
            universityName: u.name,
            imageUrl: u.imageUrl || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800",
            createdAt: new Date().toISOString()
          });
        }
      });
    }

    // Seed Chinese and Russian government-wide scholarships where university is not mandatory!
    data.scholarships.push({
      id: "sch-csc",
      title: "Chinese Government Scholarship (CSC)",
      description: "A prestigious fully-funded initiative by the Ministry of Education of China to support outstanding international students. Covers 100% tuition, free university accommodation, comprehensive medical insurance, and a monthly personal stipend of up to CNY 3,500/month.",
      amount: "100% Tuition + Free Accommodation + Stipend",
      isFullyFunded: true,
      countryId: "c-cn",
      universityName: "Various Chinese State Universities (Govt-Sponsored)",
      imageUrl: "https://images.unsplash.com/photo-1547989453-11e67ffb3885?auto=format&fit=crop&q=80&w=800",
      createdAt: new Date().toISOString()
    });

    data.scholarships.push({
      id: "sch-russia",
      title: "Russian Federation State fully-funded Fellowship",
      description: "An elite program sponsored by the Ministry of Education and science of Russian Federation, covering complete tuition costs, subsidized university accommodation, and monthly maintenance stipends for scientific / technical fields.",
      amount: "100% Tuition Waiver + Free University Dormitory",
      isFullyFunded: true,
      countryId: "c-ru",
      universityName: "Russian Federal & Scientific Institutes (Govt-Sponsored)",
      imageUrl: "https://images.unsplash.com/photo-1520106212299-d99c443e4568?auto=format&fit=crop&q=80&w=800",
      createdAt: new Date().toISOString()
    });

    dbChanged = true;
  }

  if (!data.conversations) {
    data.conversations = [];
    dbChanged = true;
  }
  if (!data.messages) {
    data.messages = [];
    dbChanged = true;
  }
  if (!data.chatNotifications) {
    data.chatNotifications = [];
    dbChanged = true;
  }

  if (dbChanged) {
    saveDB(data);
  }

  return data;
}

// Fallback initial seed generator
function getFallbackSeed(): DataBaseSchema {
  const seed: DataBaseSchema = {
    systemSettings: {
      disableStudentLogin: false,
      disableStudentRegister: false,
      disableAgentLogin: false,
      disableAgentRegister: false
    },
    users: [
      {
        id: "usr-admin-primary",
        email: "ftz.edu.consultancy@gmail.com",
        name: "FTZ Consultancy Primary Admin",
        role: "admin",
        status: "approved",
        avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
        createdAt: new Date().toISOString(),
        password: "farhas@1234"
      },
      {
        id: "usr-admin-backup",
        email: "ftz.edu.backup@gmail.com",
        name: "FTZ Consultancy Backup Admin",
        role: "admin",
        status: "approved",
        avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200",
        createdAt: new Date().toISOString(),
        password: "farhas@1234"
      },
      {
        id: "usr-student-1",
        email: "student@globaledu.com",
        name: "Alex Rivera",
        role: "student",
        status: "approved",
        avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=200",
        createdAt: new Date().toISOString(),
      }
    ],
    countries: [
      {
        id: "c-uk",
        name: "United Kingdom",
        imageUrl: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&q=80&w=800",
        description: "World-renowned research centers with academic heritage like Oxford and Cambridge."
      },
      {
        id: "c-usa",
        name: "United States",
        imageUrl: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&q=80&w=800",
        description: "Home of Ivy League institutions boasting diverse programs and high entrepreneurship."
      },
      {
        id: "c-ca",
        name: "Canada",
        imageUrl: "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&q=80&w=800",
        description: "Post-graduate work permit opportunities and highly welcoming student cultures."
      },
      {
        id: "c-de",
        name: "Germany",
        imageUrl: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=800",
        description: "Extremely affordable public universities with robust technical and engineering leads."
      }
    ],
    universities: [
      {
        id: "u-oxford",
        name: "University of Oxford",
        countryId: "c-uk",
        imageUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800",
        programs: ["Bachelor", "Master", "PhD"],
        subjects: ["Computer Science", "PPE", "Biological Sciences", "MBA"],
        scholarship: {
          isFullyFunded: true,
          title: "Clarendon Fund Academic Scholarship",
          description: "Fully covers tuition fees, college fees, and essential living costs for highly competitive applicants globally.",
          amount: "Full Tuition + £18,622/yr stipend"
        }
      },
      {
        id: "u-tum",
        name: "Technical University of Munich",
        countryId: "c-de",
        imageUrl: "https://images.unsplash.com/photo-1562774053-2010d522f13f?auto=format&fit=crop&q=80&w=800",
        programs: ["Bachelor", "Master"],
        subjects: ["Aerospace Engineering", "Data Science", "Mechanical Engineering", "Biotechnology"],
        scholarship: {
          isFullyFunded: true,
          title: "DAAD Tuition Waiver & Achievement award",
          description: "Designed for international outstanding talent in STEM portfolios, covering living expenses and general enrollment.",
          amount: "€1,200/month stipend + Free Tuition"
        }
      },
      {
        id: "u-toronto",
        name: "University of Toronto",
        countryId: "c-ca",
        imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&q=80&w=800",
        programs: ["Bachelor", "Master", "PhD"],
        subjects: ["Artificial Intelligence", "Finance", "Civil Engineering", "Biomedical Science"],
        scholarship: {
          isFullyFunded: false,
          title: "Lester B. Pearson International Scholarship",
          description: "Awarded annually to showcase outstanding academic achievement and creative thinking, covering full scholarship support.",
          amount: "Full Tuition + Book allowance"
        }
      },
      {
        id: "u-harvard",
        name: "Harvard University",
        countryId: "c-usa",
        imageUrl: "https://images.unsplash.com/photo-1622397333309-30564018d53c?auto=format&fit=crop&q=80&w=800",
        programs: ["Bachelor", "Master", "PhD"],
        subjects: ["Computer Science", "Business Administration", "Economics", "Law"],
        scholarship: {
          isFullyFunded: true,
          title: "Harvard Presidential Fellowship",
          description: "Premium tuition support and research fellowship awards for chosen graduate entrants.",
          amount: "Full Tuition + $42,000/yr stipend"
        }
      }
    ],
    applications: [
      {
        id: "app-1",
        studentId: "usr-student-1",
        studentName: "Alex Rivera",
        studentEmail: "student@globaledu.com",
        universityId: "u-toronto",
        universityName: "University of Toronto",
        countryId: "c-ca",
        countryName: "Canada",
        program: "Master",
        passportNumber: "P-A7812903",
        documents: [
          {
            name: "Academic_Transcript.pdf",
            url: "#",
            size: "1.2 MB",
            uploadedAt: new Date().toISOString()
          },
          {
            name: "Passport_Scan.jpg",
            url: "#",
            size: "820 KB",
            uploadedAt: new Date().toISOString()
          }
        ],
        status: "Application Submitted",
        notes: [
          {
            id: "n-1",
            author: "Director Administrator",
            authorRole: "admin",
            text: "Welcome, Alex! We have reviewed your initial grade forms. Please upload your formal IELTS or TOEFL transcripts to progress.",
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
          },
          {
            id: "n-2",
            author: "Sarah Jenkins (Senior Agent)",
            authorRole: "agent",
            text: "Verified the passport details coordinate correctly. Reaching out with Toronto registrar tomorrow.",
            createdAt: new Date(Date.now() - 3600000).toISOString()
          }
        ],
        agentId: "usr-agent-1",
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
      }
    ],
    staff: [
      {
        id: "s-1",
        name: "Dr. Aris Thorne",
        role: "Chief Executive Officer",
        bio: "Over 15 years in international admissions leadership, previously coordinating college partnerships inside the UK and Canada.",
        imageUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=300"
      },
      {
        id: "s-2",
        name: "Clara Mendez",
        role: "Lead Visa Specialist",
        bio: "Specializes in high-success visa and migration compliance portfolios for European and North American academic channels.",
        imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=300"
      },
      {
        id: "s-3",
        name: "John Sterling",
        role: "Senior Student Advisor",
        bio: "Devoted to custom profile branding and scholarship optimization, aiding thousands of scholars in unlocking fully funded seats.",
        imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=300"
      }
    ],
    storageConfig: {
      destinationLink: "https://drive.google.com/drive/folders/1abc90823x_default_global_edu_storage",
      provider: "Google Drive"
    },
    branding: {
      name: "GlobalEdu Consultancy",
      logoText: "GE",
      primaryColor: "indigo",
      emailContact: "admissions@globaledu.com",
      welcomeTitle: "Empowering Next-Gen Scholars Across Prestigious Global Borders",
      welcomeLetter: "Welcome to GlobalEdu Consultancy, your accredited pathway partner to premier world-class universities and fully funded scholarship projects. Since 2011, our specialized agency of international advisors has worked to eliminate the complex obstacles of enrollment, document attestation, and study permit compliance. We take pride in mentoring high-potential candidates to secure admits, fellowship awards, and visa clearances across Europe, the UK, the US, and Canada. Select and explore your prospective academic gateways below to coordinate with our designated Admissions Portal.",
      statsStudents: "14,200+",
      statsUniversities: "220+",
      statsScholarships: "$46,000,000+",
      statsVisaRate: "99.4%"
    }
  };

  saveDB(seed);
  return seed;
}

function saveDB(data: DataBaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving database file", e);
  }
}

// REST APIs
// Get full state or specific items
app.get("/api/db", (req, res) => {
  res.json(loadDB());
});

// App Branding
app.get("/api/branding", (req, res) => {
  res.json(loadDB().branding);
});

app.put("/api/branding", (req, res) => {
  const db = loadDB();
  db.branding = { ...db.branding, ...req.body };
  saveDB(db);
  res.json(db.branding);
});

// Storage Config
app.get("/api/storage", (req, res) => {
  res.json(loadDB().storageConfig);
});

app.put("/api/storage", (req, res) => {
  const db = loadDB();
  db.storageConfig = { ...db.storageConfig, ...req.body };
  saveDB(db);
  res.json(db.storageConfig);
});

// System Settings Control (Login & Register Toggles)
app.get("/api/system-settings", (req, res) => {
  res.json(loadDB().systemSettings || {
    disableStudentLogin: false,
    disableStudentRegister: false,
    disableAgentLogin: false,
    disableAgentRegister: false
  });
});

app.put("/api/system-settings", (req, res) => {
  const db = loadDB();
  db.systemSettings = { ...db.systemSettings, ...req.body };
  saveDB(db);
  res.json(db.systemSettings);
});

// Authentication
app.post("/api/auth/login", (req, res) => {
  const { email, password, isGoogleSignIn, name, googleAvatar } = req.body;
  const db = loadDB();

  const settings = db.systemSettings || {
    disableStudentLogin: false,
    disableStudentRegister: false,
    disableAgentLogin: false,
    disableAgentRegister: false
  };

  if (isGoogleSignIn) {
    let role = req.body.role || "student"; // 'student' or 'agent'
    if (role === "admin") {
      role = "student"; // Force student role for new Google auto-registrations
    }
    const cleanEmail = email.trim();
    let user = db.users.find((u) => u.email.toLowerCase().trim() === cleanEmail.toLowerCase());
    
    if (!user) {
      if (role === "student" && settings.disableStudentRegister) {
        return res.status(403).json({
          error: "Student registration is currently disabled by administrators."
        });
      }
      if (role === "agent" && settings.disableAgentRegister) {
        return res.status(403).json({
          error: "Agent registration is currently disabled by administrators."
        });
      }

      // Auto-register student or agent
      user = {
        id: "usr-" + Math.random().toString(36).substr(2, 9),
        email: cleanEmail,
        name: name || email.split("@")[0],
        role: role,
        status: "pending", // Waiting for Admin approval!
        avatarUrl: googleAvatar || (role === "agent"
          ? "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200"
          : "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"),
        studentId: role === "student" ? generateUniqueStudentId(db) : undefined,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      saveDB(db);
    }
    
    if (user.role === "student" && settings.disableStudentLogin) {
      return res.status(403).json({
        error: "Student login is currently disabled by administrators."
      });
    }

    if (user.role === "agent" && settings.disableAgentLogin) {
      return res.status(403).json({
        error: "Agent login is currently disabled by administrators."
      });
    }

    if (user.role !== "admin" && user.status === "pending") {
      return res.status(403).json({
        error: "WAITING_FOR_ADMIN_APPROVAL",
        message: `${user.role === 'agent' ? 'Your Advisor registration request' : 'Your Student Google sign-in'} has been filed successfully. It is currently waiting for administrator approval in the Admin Portal.`
      });
    }
    
    return res.json({ user });
  }

  // Standard Email+Password login (commonly for Agents & Admins, but also students)
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const cleanEmail = email.trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase().trim() === cleanEmail);
  
  if (!user) {
    return res.status(401).json({ error: "No user found with this email" });
  }

  // Check login disabled settings
  if (user.role === "student" && settings.disableStudentLogin) {
    return res.status(403).json({
      error: "Student login is currently disabled by administrators."
    });
  }

  if (user.role === "agent" && settings.disableAgentLogin) {
    return res.status(403).json({
      error: "Agent login is currently disabled by administrators."
    });
  }

  // Check if account approved by admin
  if (user.role !== "admin" && user.status === "pending") {
    return res.status(403).json({
      error: "WAITING_FOR_ADMIN_APPROVAL",
      message: "This account is currently waiting for administrator approval. Please ask an admin to authorize it in the Admin Portal."
    });
  }

  // Lazily assign password on first standard email sign-in if seeded / Google sign-in was passwordless
  if (!user.password && password) {
    user.password = password;
    saveDB(db);
  }

  // Pure demo matching password rules
  if (user) {
    if (user.role === 'admin') {
      if (password !== 'farhas@1234') {
        return res.status(401).json({ error: "Invalid password for administrator. Please enter 'farhas@1234'" });
      }
    } else if (user.password && password !== user.password) {
      return res.status(401).json({ error: "Invalid password for this account. Please enter your registered password." });
    }
  }

  res.json({ user });
});

function generateUniqueStudentId(db: any): string {
  let studentId = "";
  let isUnique = false;
  while (!isUnique) {
    const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit number
    studentId = `STU-${rand}`;
    isUnique = !db.users.some((u: any) => u.studentId === studentId);
  }
  return studentId;
}

app.post("/api/auth/register", (req, res) => {
  const { email, name, role, password, countries } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const db = loadDB();

  const settings = db.systemSettings || {
    disableStudentLogin: false,
    disableStudentRegister: false,
    disableAgentLogin: false,
    disableAgentRegister: false
  };

  if (role === "student" && settings.disableStudentRegister) {
    return res.status(403).json({ error: "Student registration is currently disabled by administrators." });
  }

  if (role === "agent" && settings.disableAgentRegister) {
    return res.status(403).json({ error: "Agent registration is currently disabled by administrators." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existingUser = db.users.find((u) => u.email.toLowerCase().trim() === cleanEmail);
  if (existingUser) {
    return res.status(400).json({ error: "User already registered with this email" });
  }

  const newUser: User = {
    id: "usr-" + Math.random().toString(36).substr(2, 9),
    email: cleanEmail,
    name,
    role, // 'agent' | 'student'
    status: "pending", // must be approved by admin
    avatarUrl: `https://images.unsplash.com/photo-${role === 'agent' ? '1573496359142-b8d87734a5a2' : '1535713875055-d1d0cf377fde'}?auto=format&fit=crop&q=80&w=200`,
    countries: role === "agent" ? (countries || []) : undefined,
    studentId: role === "student" ? generateUniqueStudentId(db) : undefined,
    createdAt: new Date().toISOString(),
    password: password || undefined,
  };

  db.users.push(newUser);
  saveDB(db);
  res.json({ user: newUser });
});

// Countries
app.get("/api/countries", (req, res) => {
  res.json(loadDB().countries);
});

app.post("/api/countries", (req, res) => {
  const db = loadDB();
  const newCountry: Country = {
    id: "c-" + Math.random().toString(36).substr(2, 9),
    ...req.body,
  };
  db.countries.push(newCountry);
  saveDB(db);
  res.json(newCountry);
});

app.put("/api/countries/:id", (req, res) => {
  const db = loadDB();
  const idx = db.countries.findIndex((c) => c.id === req.params.id);
  if (idx !== -1) {
    db.countries[idx] = { ...db.countries[idx], ...req.body };
    
    // Propagate country name change to applications
    if (req.body.name && db.applications) {
      db.applications.forEach((app) => {
        if (app.countryId === req.params.id) {
          app.countryName = req.body.name;
        }
      });
    }

    saveDB(db);
    res.json(db.countries[idx]);
  } else {
    res.status(404).json({ error: "Country not found" });
  }
});

app.delete("/api/countries/:id", (req, res) => {
  const db = loadDB();
  db.countries = db.countries.filter((c) => c.id !== req.params.id);
  // Also clean up or orphan universities? We can keep them
  saveDB(db);
  res.json({ success: true });
});

// Universities
app.get("/api/universities", (req, res) => {
  res.json(loadDB().universities);
});

app.post("/api/universities", (req, res) => {
  const db = loadDB();
  const newUni: University = {
    id: "u-" + Math.random().toString(36).substr(2, 9),
    name: req.body.name,
    countryId: req.body.countryId,
    imageUrl: req.body.imageUrl || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800",
    programs: req.body.programs || ["Bachelor", "Master"],
    subjects: req.body.subjects || ["Computer Science"],
    scholarship: req.body.scholarship || { isFullyFunded: false, title: "", description: "", amount: "" },
    summerDeadline: req.body.summerDeadline || "",
    fallDeadline: req.body.fallDeadline || "",
    adminComment: req.body.adminComment || ""
  };
  db.universities.push(newUni);
  saveDB(db);
  res.json(newUni);
});

app.put("/api/universities/:id", (req, res) => {
  const db = loadDB();
  const idx = db.universities.findIndex((u) => u.id === req.params.id);
  if (idx !== -1) {
    db.universities[idx] = { ...db.universities[idx], ...req.body };
    if (req.body.scholarship === null) {
      delete db.universities[idx].scholarship;
    }
    
    // Propagate university name changes to applications
    if (req.body.name && db.applications) {
      db.applications.forEach((app) => {
        if (app.universityId === req.params.id) {
          app.universityName = req.body.name;
        }
      });
    }

    // Propagate countryId or countryName change in case university's country association is changed
    if (req.body.countryId && db.applications) {
      const country = db.countries.find((c) => c.id === req.body.countryId);
      if (country) {
        db.applications.forEach((app) => {
          if (app.universityId === req.params.id) {
            app.countryId = req.body.countryId;
            app.countryName = country.name;
          }
        });
      }
    }

    saveDB(db);
    res.json(db.universities[idx]);
  } else {
    res.status(404).json({ error: "University not found" });
  }
});

app.delete("/api/universities/:id", (req, res) => {
  const db = loadDB();
  db.universities = db.universities.filter((u) => u.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// Scholarships
app.get("/api/scholarships", (req, res) => {
  res.json(loadDB().scholarships || []);
});

app.post("/api/scholarships", (req, res) => {
  const db = loadDB();
  if (!db.scholarships) db.scholarships = [];

  const newSch: GlobalScholarship = {
    id: "sch-" + Math.random().toString(36).substr(2, 9),
    title: req.body.title,
    description: req.body.description,
    amount: req.body.amount,
    isFullyFunded: !!req.body.isFullyFunded,
    countryId: req.body.countryId,
    universityId: req.body.universityId || undefined,
    universityName: req.body.universityName || undefined,
    imageUrl: req.body.imageUrl || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800",
    createdAt: new Date().toISOString(),
    summerDeadline: req.body.summerDeadline || "",
    fallDeadline: req.body.fallDeadline || "",
    adminComment: req.body.adminComment || ""
  };

  db.scholarships.push(newSch);
  saveDB(db);
  res.json(newSch);
});

app.put("/api/scholarships/:id", (req, res) => {
  const db = loadDB();
  if (!db.scholarships) db.scholarships = [];

  const idx = db.scholarships.findIndex((s) => s.id === req.params.id);
  if (idx !== -1) {
    db.scholarships[idx] = {
      ...db.scholarships[idx],
      ...req.body,
      isFullyFunded: req.body.isFullyFunded !== undefined ? !!req.body.isFullyFunded : db.scholarships[idx].isFullyFunded
    };
    saveDB(db);
    res.json(db.scholarships[idx]);
  } else {
    res.status(404).json({ error: "Scholarship not found" });
  }
});

app.delete("/api/scholarships/:id", (req, res) => {
  const db = loadDB();
  if (!db.scholarships) db.scholarships = [];

  db.scholarships = db.scholarships.filter((s) => s.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// Applications
app.get("/api/applications", (req, res) => {
  res.json(loadDB().applications);
});

app.delete("/api/applications/:id", (req, res) => {
  const db = loadDB();
  db.applications = db.applications.filter((a) => a.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

app.post("/api/applications", (req, res) => {
  const db = loadDB();
  const { studentId, universityId, program, passportNumber, documents, comment } = req.body;

  let uni = db.universities.find((u) => u.id === universityId);
  
  // Resolve virtual university schema for country-wide or gov scholarships
  if (!uni && universityId && universityId.startsWith("u-sch-")) {
    const schId = universityId.replace("u-sch-", "");
    const foundSch = (db.scholarships || []).find((s) => s.id === schId);
    if (foundSch) {
      uni = {
        id: universityId,
        name: foundSch.universityName || foundSch.title,
        countryId: foundSch.countryId,
        imageUrl: foundSch.imageUrl || foundSch.imageUrl || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=800",
        programs: ["Scholarship Program Only (Full Funding)"],
        subjects: ["All Supported Disciplines"]
      } as any;
    }
  }

  const student = db.users.find((u) => u.id === studentId);
  
  if (!uni || !student) {
    return res.status(400).json({ error: "Invalid student or university" });
  }

  const country = db.countries.find((c) => c.id === uni.countryId);

  // Automatically assign an agent if one is approved in the system
  const agents = db.users.filter((u) => u.role === "agent" && u.status === "approved");
  const assignedAgentId = agents.length > 0 ? agents[Math.floor(Math.random() * agents.length)].id : "usr-agent-1";

  const newApp: Application = {
    id: "app-" + Math.random().toString(36).substr(2, 9),
    studentId,
    studentName: student.name,
    studentEmail: student.email,
    universityId,
    universityName: uni.name,
    countryId: uni.countryId,
    countryName: country ? country.name : "Global",
    program,
    passportNumber,
    documents: documents || [],
    status: "Request to Agency",
    notes: comment ? [
      {
        id: "note-init",
        author: student.name,
        authorRole: "student",
        text: comment,
        createdAt: new Date().toISOString(),
      }
    ] : [],
    agentId: assignedAgentId,
    createdAt: new Date().toISOString(),
  };

  db.applications.push(newApp);
  saveDB(db);
  res.json(newApp);
});

// Update Application Status & Notes
app.put("/api/applications/:id/status", (req, res) => {
  const db = loadDB();
  const { status, updaterName, updaterRole, noteText, portalScreenshot } = req.body;
  const idx = db.applications.findIndex((a) => a.id === req.params.id);

  if (idx !== -1) {
    db.applications[idx].status = status;
    if (portalScreenshot !== undefined) {
      db.applications[idx].portalScreenshot = portalScreenshot;
    }
    
    if (noteText && noteText.trim()) {
      db.applications[idx].notes.push({
        id: "n-" + Math.random().toString(36).substr(2, 9),
        author: updaterName,
        authorRole: updaterRole,
        text: noteText,
        createdAt: new Date().toISOString()
      });
    }

    saveDB(db);
    res.json(db.applications[idx]);
  } else {
    res.status(404).json({ error: "Application not found" });
  }
});

// Add Note to Application
app.post("/api/applications/:id/notes", (req, res) => {
  const db = loadDB();
  const { author, authorRole, text } = req.body;
  const idx = db.applications.findIndex((a) => a.id === req.params.id);

  if (idx !== -1) {
    const newNote = {
      id: "n-" + Math.random().toString(36).substr(2, 9),
      author,
      authorRole,
      text,
      createdAt: new Date().toISOString()
    };
    db.applications[idx].notes.push(newNote);
    saveDB(db);
    res.json(newNote);
  } else {
    res.status(404).json({ error: "Application not found" });
  }
});

// Assign Agent
app.put("/api/applications/:id/assign", (req, res) => {
  const db = loadDB();
  const { agentId } = req.body;
  const idx = db.applications.findIndex((a) => a.id === req.params.id);

  if (idx !== -1) {
    db.applications[idx].agentId = agentId;
    saveDB(db);
    res.json(db.applications[idx]);
  } else {
    res.status(404).json({ error: "Application not found" });
  }
});

// Users Management (Admin view)
app.get("/api/users", (req, res) => {
  res.json(loadDB().users);
});

app.put("/api/users/:id/approve", (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx !== -1) {
    db.users[idx].status = "approved";
    saveDB(db);
    res.json(db.users[idx]);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.put("/api/users/:id/credentials", (req, res) => {
  const { email, password, name, role, status, countries, studentId } = req.body;
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx !== -1) {
    if (email !== undefined) db.users[idx].email = email.trim().toLowerCase();
    if (password !== undefined) db.users[idx].password = password;
    if (name !== undefined) db.users[idx].name = name;
    if (role !== undefined) db.users[idx].role = role;
    if (status !== undefined) db.users[idx].status = status;
    if (countries !== undefined) db.users[idx].countries = countries;
    if (studentId !== undefined) db.users[idx].studentId = studentId;
    saveDB(db);
    res.json(db.users[idx]);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.put("/api/users/:id/profile-photo", (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx !== -1) {
    db.users[idx].avatarUrl = req.body.avatarUrl;
    saveDB(db);
    res.json(db.users[idx]);
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.delete("/api/users/:id", (req, res) => {
  const db = loadDB();
  db.users = db.users.filter((u) => u.id !== req.params.id);
  db.applications = db.applications.filter((a) => a.studentId !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// Staff
app.get("/api/staff", (req, res) => {
  res.json(loadDB().staff);
});

app.post("/api/staff", (req, res) => {
  const db = loadDB();
  const newStaff: Staff = {
    id: "s-" + Math.random().toString(36).substr(2, 9),
    ...req.body
  };
  db.staff.push(newStaff);
  saveDB(db);
  res.json(newStaff);
});

app.put("/api/staff/:id", (req, res) => {
  const db = loadDB();
  const idx = db.staff.findIndex((s) => s.id === req.params.id);
  if (idx !== -1) {
    db.staff[idx] = { ...db.staff[idx], ...req.body };
    saveDB(db);
    res.json(db.staff[idx]);
  } else {
    res.status(404).json({ error: "Staff not found" });
  }
});

app.delete("/api/staff/:id", (req, res) => {
  const db = loadDB();
  db.staff = db.staff.filter((s) => s.id !== req.params.id);
  saveDB(db);
  res.json({ success: true });
});

// Handle simulated file uploads using base64
app.post("/api/upload", (req, res) => {
  const { fileName, base64Data } = req.body;
  if (!fileName || !base64Data) {
    return res.status(400).json({ error: "File name and data are required" });
  }

  try {
    // Strip header if present
    const cleanBase64 = base64Data.replace(/^data:.*;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    const uniqueName = `${Date.now()}-${fileName.replace(/\s+/g, "_")}`;
    const filePath = path.join(UPLOADS_DIR, uniqueName);
    
    fs.writeFileSync(filePath, buffer);
    
    const fileUrl = `/uploads/${uniqueName}`;
    res.json({ url: fileUrl, name: fileName });
  } catch (err: any) {
    console.error("File upload error:", err);
    res.status(500).json({ error: "Failed to upload file is " + err.message });
  }
});

// --- Chat / Messaging Endpoints ---
const onlineUsers = new Map<string, WSWebSocket>();

function broadcastPresence(userId: string, isOnline: boolean) {
  const payload = JSON.stringify({
    type: "presence",
    userId,
    isOnline
  });
  onlineUsers.forEach((ws) => {
    if (ws.readyState === 1) { // 1 is WebSocket.OPEN
      try {
        ws.send(payload);
      } catch (err) {
        console.error("Presence broadcast error for user:", userId, err);
      }
    }
  });
}

// Get allowed users to chat with
app.get("/api/chat/users", (req, res) => {
  const { userId, role } = req.query;
  if (!userId || !role) {
    return res.status(400).json({ error: "userId and role are required" });
  }
  const db = loadDB();
  let allowedUsers = db.users.filter(u => u.id !== userId && u.status === 'approved');
  
  if (role === "student") {
    allowedUsers = allowedUsers.filter(u => u.role === "admin" || u.role === "agent");
  } else if (role === "agent") {
    allowedUsers = allowedUsers.filter(u => u.role === "admin" || u.role === "student");
  }
  
  const enriched = allowedUsers.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatarUrl,
    isOnline: onlineUsers.has(u.id)
  }));

  res.json(enriched);
});

// Create/get a conversation
app.post("/api/chat/conversations", (req, res) => {
  const { participants } = req.body;
  if (!participants || participants.length < 2) {
    return res.status(400).json({ error: "At least two participants are required" });
  }
  const db = loadDB();
  if (!db.conversations) db.conversations = [];
  
  let conv = db.conversations.find(c => 
    c.participants.length === participants.length &&
    participants.every(p => c.participants.includes(p))
  );
  
  if (!conv) {
    conv = {
      id: "conv-" + Math.random().toString(36).substr(2, 9),
      participants,
      createdAt: new Date().toISOString(),
    };
    db.conversations.push(conv);
    saveDB(db);
  }
  res.json(conv);
});

// Get conversations for a user
app.get("/api/chat/conversations", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  const isAdmin = user && user.role === "admin";

  const userConvs = (db.conversations || []).filter(c => 
    isAdmin ? true : c.participants.includes(userId as string)
  );
  
  const enriched = userConvs.map(c => {
    const isParticipant = c.participants.includes(userId as string);
    const otherParticipantIds = isParticipant 
      ? c.participants.filter(pId => pId !== userId)
      : c.participants;

    let otherParticipants = otherParticipantIds.map(pId => {
      const u = db.users.find(user => user.id === pId);
      return u ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        avatarUrl: u.avatarUrl,
        isOnline: (u.role !== "admin" && u.role !== "agent") && onlineUsers.has(u.id),
      } : null;
    }).filter(Boolean) as any[];
    
    // If Admin is viewing a conversation they are not in, customize otherParticipants to represent the conversation between the two users clearly!
    if (!isParticipant && otherParticipants.length >= 2) {
      const p1 = otherParticipants[0];
      const p2 = otherParticipants[1];
      const virtualParticipant = {
        id: `virtual-${c.id}`,
        name: `${p1.name} ↔ ${p2.name}`,
        email: `${p1.email} / ${p2.email}`,
        role: `${p1.role} & ${p2.role} (Admin Monitor)`,
        avatarUrl: null,
        isOnline: p1.isOnline || p2.isOnline,
      };
      otherParticipants = [virtualParticipant, ...otherParticipants];
    } else if (!isParticipant && otherParticipants.length === 1) {
      const p1 = otherParticipants[0];
      const virtualParticipant = {
        id: `virtual-${c.id}`,
        name: `${p1.name} (Solo Conversation)`,
        email: p1.email,
        role: `${p1.role} (Admin Monitor)`,
        avatarUrl: null,
        isOnline: p1.isOnline,
      };
      otherParticipants = [virtualParticipant, ...otherParticipants];
    }
    
    const unreadCount = (db.messages || []).filter(m => 
      m.conversationId === c.id && 
      m.senderId !== userId && 
      !m.seen
    ).length;

    return {
      ...c,
      otherParticipants,
      unreadCount
    };
  });

  res.json(enriched);
});

// Get messages for a conversation
app.get("/api/chat/conversations/:id/messages", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const msgs = (db.messages || []).filter(m => m.conversationId === id);
  res.json(msgs);
});

// Delete an individual message
app.delete("/api/chat/messages/:id", (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId is required to delete a message" });
  }

  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!db.messages) db.messages = [];
  const msgIdx = db.messages.findIndex(m => m.id === id);
  if (msgIdx === -1) {
    return res.status(404).json({ error: "Message not found" });
  }

  const message = db.messages[msgIdx];

  // Allow if sender of message OR is admin / agent
  const isSender = message.senderId === userId;
  const isAuthorized = user.role === "admin" || user.role === "agent" || isSender;

  if (!isAuthorized) {
    return res.status(403).json({ error: "You are not authorized to delete this message" });
  }

  // Delete message
  db.messages.splice(msgIdx, 1);
  saveDB(db);

  // Notify everyone in the conversation
  const conv = (db.conversations || []).find(c => c.id === message.conversationId);
  if (conv) {
    conv.participants.forEach(pId => {
      const ws = onlineUsers.get(pId);
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({
            type: "message_deleted",
            messageId: id,
            conversationId: message.conversationId
          }));
        } catch (err) {
          console.error("WS error sending deletion notice:", err);
        }
      }
    });
  }

  res.json({ success: true, message: "Message deleted successfully" });
});

// Send a message
app.post("/api/chat/messages", (req, res) => {
  const { conversationId, senderId, senderName, text, attachment } = req.body;
  if (!conversationId || !senderId || !senderName) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const db = loadDB();
  
  const newMessage: Message = {
    id: "msg-" + Math.random().toString(36).substr(2, 9),
    conversationId,
    senderId,
    senderName,
    text: text || "",
    timestamp: new Date().toISOString(),
    seen: false,
    attachment: attachment || undefined
  };

  if (!db.messages) db.messages = [];
  db.messages.push(newMessage);

  if (!db.conversations) db.conversations = [];
  const convIdx = db.conversations.findIndex(c => c.id === conversationId);
  if (convIdx !== -1) {
    db.conversations[convIdx].lastMessageText = attachment ? `Sent an attachment: ${attachment.name}` : text;
    db.conversations[convIdx].lastMessageTimestamp = newMessage.timestamp;
  }

  saveDB(db);

  const conv = db.conversations.find(c => c.id === conversationId);
  if (conv) {
    conv.participants.forEach(pId => {
      const ws = onlineUsers.get(pId);
      if (ws && ws.readyState === 1) { // 1 is WebSocket.OPEN
        try {
          ws.send(JSON.stringify({
            type: "message",
            message: newMessage
          }));
        } catch (err) {
          console.error("WS error sending to user:", pId, err);
        }
      } else if (pId !== senderId) {
        if (!db.chatNotifications) db.chatNotifications = [];
        const newNotif: ChatNotification = {
          id: "notif-" + Math.random().toString(36).substr(2, 9),
          recipientId: pId,
          senderId,
          senderName,
          type: 'message',
          text: text || "Sent an attachment",
          read: false,
          createdAt: new Date().toISOString()
        };
        db.chatNotifications.push(newNotif);
        saveDB(db);
      }
    });
  }

  res.json(newMessage);
});

// Mark messages as seen
app.put("/api/chat/conversations/:id/seen", (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const db = loadDB();
  let updated = false;
  if (db.messages) {
    db.messages.forEach(m => {
      if (m.conversationId === id && m.senderId !== userId && !m.seen) {
        m.seen = true;
        m.seenAt = new Date().toISOString();
        updated = true;
      }
    });
  }
  
  if (updated) {
    saveDB(db);
    
    const conv = db.conversations?.find(c => c.id === id);
    if (conv) {
      conv.participants.forEach(pId => {
        const ws = onlineUsers.get(pId);
        if (ws && ws.readyState === 1) {
          try {
            ws.send(JSON.stringify({
              type: "seen",
              conversationId: id,
              userId
            }));
          } catch (err) {
            console.error("WS seen send error:", err);
          }
        }
      });
    }
  }

  res.json({ success: true });
});

// Get notifications
app.get("/api/chat/notifications", (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const db = loadDB();
  const notifs = (db.chatNotifications || []).filter(n => n.recipientId === userId && !n.read);
  res.json(notifs);
});

// Mark notifications as read
app.put("/api/chat/notifications/read-all", (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const db = loadDB();
  let updated = false;
  if (db.chatNotifications) {
    db.chatNotifications.forEach(n => {
      if (n.recipientId === userId && !n.read) {
        n.read = true;
        updated = true;
      }
    });
  }
  if (updated) {
    saveDB(db);
  }
  res.json({ success: true });
});

// Delete full conversation (Admin or Participant)
app.delete("/api/chat/conversations/:id", (req, res) => {
  const { id } = req.params;
  const { adminId } = req.query; // acts as any user id
  
  if (!adminId) {
    return res.status(400).json({ error: "userId is required to delete conversations" });
  }

  const db = loadDB();
  const user = db.users.find(u => u.id === adminId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const conv = (db.conversations || []).find(c => c.id === id);
  if (!conv) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  // Allow if user is admin, agent, or is one of the conversation's participants
  const isParticipant = conv.participants && conv.participants.includes(adminId as string);
  const isAuthorized = user.role === "admin" || user.role === "agent" || isParticipant;

  if (!isAuthorized) {
    return res.status(403).json({ error: "You are not authorized to delete this conversation" });
  }

  // Remove messages of this conversation
  if (db.messages) {
    db.messages = db.messages.filter(m => m.conversationId !== id);
  }

  // Remove conversation itself
  if (db.conversations) {
    db.conversations = db.conversations.filter(c => c.id !== id);
  }

  saveDB(db);

  // Broadcast to online users so they update their UI
  onlineUsers.forEach((ws) => {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({
          type: "conversation_deleted",
          conversationId: id
        }));
      } catch (err) {
        console.error("Error broadcasting conversation deletion:", err);
      }
    }
  });

  res.json({ success: true, message: "Conversation history deleted successfully" });
});

// Vite server setup or static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const reqUrl = request.url || "";
    console.log(`[WS UPGRADE] Received upgrade request for URL: ${reqUrl}`);
    try {
      let pathname = "";
      if (reqUrl.startsWith("http://") || reqUrl.startsWith("https://") || reqUrl.startsWith("ws://") || reqUrl.startsWith("wss://")) {
        const parsed = new URL(reqUrl);
        pathname = parsed.pathname;
      } else {
        const tempUrl = reqUrl.startsWith("/") ? reqUrl : "/" + reqUrl;
        const parsed = new URL(tempUrl, "http://localhost");
        pathname = parsed.pathname;
      }

      // Strip trailing slashes
      if (pathname.endsWith("/") && pathname !== "/") {
        pathname = pathname.slice(0, -1);
      }

      console.log(`[WS UPGRADE] Resolved pathname to: "${pathname}"`);

      if (pathname === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        console.log(`[WS UPGRADE] Skipping upgrade for non-chat path: "${pathname}"`);
      }
    } catch (err) {
      console.error("[WS UPGRADE] Routing error:", err);
    }
  });

  wss.on("connection", (ws, req) => {
    ws.on("error", (err) => {
      console.error("WS client connection error:", err);
    });

    const reqUrl = req.url || "";
    let userId: string | null = null;
    try {
      if (reqUrl.startsWith("http://") || reqUrl.startsWith("https://") || reqUrl.startsWith("ws://") || reqUrl.startsWith("wss://")) {
        const parsed = new URL(reqUrl);
        userId = parsed.searchParams.get("userId");
      } else {
        const tempUrl = reqUrl.startsWith("/") ? reqUrl : "/" + reqUrl;
        const parsed = new URL(tempUrl, "http://localhost");
        userId = parsed.searchParams.get("userId");
      }
    } catch (err) {
      console.error("[WS CONNECTION] URL parsing error:", err);
    }

    if (userId) {
      onlineUsers.set(userId, ws);
      broadcastPresence(userId, true);

      // Send current presence list
      ws.send(JSON.stringify({
        type: "presence_list",
        onlineUserIds: Array.from(onlineUsers.keys())
      }));
    }

    ws.on("message", (messageStr) => {
      try {
        const data = JSON.parse(messageStr.toString());
        if (data.type === "typing") {
          const { conversationId, senderId, isTyping } = data;
          const db = loadDB();
          const conv = db.conversations?.find(c => c.id === conversationId);
          if (conv) {
            conv.participants.forEach(pId => {
              if (pId !== senderId) {
                const targetWs = onlineUsers.get(pId);
                if (targetWs && targetWs.readyState === 1) {
                  targetWs.send(JSON.stringify({
                    type: "typing",
                    conversationId,
                    senderId,
                    isTyping
                  }));
                }
              }
            });
          }
        } else if (data.type === "seen") {
          const { conversationId, userId } = data;
          const db = loadDB();
          let updated = false;
          if (db.messages) {
            db.messages.forEach(m => {
              if (m.conversationId === conversationId && m.senderId !== userId && !m.seen) {
                m.seen = true;
                m.seenAt = new Date().toISOString();
                updated = true;
              }
            });
          }
          if (updated) {
            saveDB(db);
            const conv = db.conversations?.find(c => c.id === conversationId);
            if (conv) {
              conv.participants.forEach(pId => {
                const targetWs = onlineUsers.get(pId);
                if (targetWs && targetWs.readyState === 1) {
                  targetWs.send(JSON.stringify({
                    type: "seen",
                    conversationId,
                    userId
                  }));
                }
              });
            }
          }
        }
      } catch (err) {
        console.error("WS error on message:", err);
      }
    });

    ws.on("close", () => {
      if (userId) {
        onlineUsers.delete(userId);
        broadcastPresence(userId, false);
      }
    });
  });
}

startServer();
