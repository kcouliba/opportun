import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.activity.deleteMany();
  await prisma.document.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.profile.deleteMany();

  // Create profile
  const profile = await prisma.profile.create({
    data: {
      name: "Alex Martin",
      title: "Senior Fullstack Developer",
      yearsExperience: 8,
      legalStructure: "SASU",
      minimumTJM: 550,
      targetTJM: 650,
      preferredLocations: JSON.stringify(["Remote", "Paris", "Lyon"]),
      maxCommuteDays: 2,
      technologies: JSON.stringify([
        "TypeScript",
        "React",
        "Node.js",
        "Next.js",
        "PostgreSQL",
        "Docker",
        "AWS",
      ]),
      domains: JSON.stringify(["Fintech", "SaaS", "E-commerce"]),
      blacklistedClients: JSON.stringify(["ToxicCorp", "BadPayer Inc"]),
      blacklistedDomains: JSON.stringify(["Gambling", "Tobacco"]),
    },
  });

  console.log(`Created profile: ${profile.name}`);

  // Create missions
  const missions = await Promise.all([
    prisma.mission.create({
      data: {
        profileId: profile.id,
        client: "FinanceFlow",
        title: "Lead Developer - Payment Platform",
        description:
          "Leading the development of a new payment processing platform. Managing a team of 3 developers, architecting microservices, and implementing core payment flows.",
        startDate: new Date("2024-09-01"),
        endDate: null, // ongoing
        rate: 650,
        daysPerWeek: 4,
        status: "active",
      },
    }),
    prisma.mission.create({
      data: {
        profileId: profile.id,
        client: "ShopifyPlus Agency",
        title: "Senior React Developer",
        description:
          "Built custom Shopify themes and apps for enterprise clients. Implemented headless commerce solutions with Next.js.",
        startDate: new Date("2024-01-15"),
        endDate: new Date("2024-08-31"),
        rate: 600,
        daysPerWeek: 5,
        status: "completed",
      },
    }),
    prisma.mission.create({
      data: {
        profileId: profile.id,
        client: "HealthTech Startup",
        title: "Fullstack Developer",
        description:
          "Developed patient management system with React and Node.js. Implemented HIPAA-compliant data handling.",
        startDate: new Date("2023-03-01"),
        endDate: new Date("2023-12-31"),
        rate: 580,
        daysPerWeek: 5,
        status: "completed",
      },
    }),
  ]);

  console.log(`Created ${missions.length} missions`);

  // Create leads at various stages
  const leads = await Promise.all([
    // Won lead
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "referral",
        client: "DataViz Pro",
        title: "Senior Frontend Developer",
        description:
          "Looking for a senior frontend developer to build a new data visualization dashboard. React, D3.js, and TypeScript required. Long-term project with potential for tech lead role.",
        requiredTechnologies: JSON.stringify(["React", "TypeScript", "D3.js"]),
        requiredDomains: JSON.stringify(["SaaS"]),
        location: "Paris",
        remotePolicy: "hybrid",
        offeredRate: 680,
        estimatedStartDate: new Date("2026-02-15"),
        estimatedDuration: 12,
        stage: "won",
        matchScore: 92,
        contactName: "Marie Dupont",
        contactInfo: "marie.dupont@datavizpro.com",
        notes: "Great culture fit. Team uses similar stack. Flexible on remote days.",
        nextAction: "Sign contract",
        nextActionDate: new Date("2026-02-01"),
      },
    }),
    // Negotiating lead
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "linkedin",
        client: "CloudScale",
        title: "Node.js Backend Developer",
        description:
          "Building scalable microservices for a growing SaaS platform. AWS experience required. Team of 10 developers.",
        requiredTechnologies: JSON.stringify(["Node.js", "AWS", "PostgreSQL", "Docker"]),
        requiredDomains: JSON.stringify(["SaaS"]),
        location: "Remote",
        remotePolicy: "remote",
        offeredRate: 620,
        estimatedStartDate: new Date("2026-03-01"),
        estimatedDuration: 6,
        stage: "negotiating",
        matchScore: 85,
        contactName: "Thomas Bernard",
        contactInfo: "thomas@cloudscale.io",
        notes: "Trying to negotiate rate up to 650. They seem flexible.",
        nextAction: "Send updated proposal",
        nextActionDate: new Date("2026-01-30"),
      },
    }),
    // Qualified leads
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "recruiter",
        client: "BankingTech",
        title: "Fullstack Developer - Trading Platform",
        description:
          "Fintech company looking for experienced developer to work on their trading platform. High-frequency data handling required.",
        requiredTechnologies: JSON.stringify(["React", "Node.js", "PostgreSQL", "Redis"]),
        requiredDomains: JSON.stringify(["Fintech"]),
        location: "Paris",
        remotePolicy: "hybrid",
        offeredRate: 700,
        estimatedStartDate: new Date("2026-04-01"),
        estimatedDuration: 8,
        stage: "qualified",
        matchScore: 88,
        contactName: "Sophie Recruiter",
        contactInfo: "sophie@techtalent.fr",
        notes: "Excellent rate. Need to check team culture in next call.",
        nextAction: "Technical interview",
        nextActionDate: new Date("2026-02-05"),
      },
    }),
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "freework",
        client: "E-Commerce Giant",
        title: "React Developer",
        description:
          "Large e-commerce platform needs React developers for their checkout team. High traffic, performance-critical.",
        requiredTechnologies: JSON.stringify(["React", "TypeScript", "Next.js"]),
        requiredDomains: JSON.stringify(["E-commerce"]),
        location: "Lyon",
        remotePolicy: "hybrid",
        offeredRate: 600,
        estimatedStartDate: new Date("2026-03-15"),
        estimatedDuration: 12,
        stage: "qualified",
        matchScore: 78,
        contactName: "Pierre Martin",
        contactInfo: "pierre.martin@ecommercegiant.com",
        notes: "Rate is a bit low but interesting project. Good for portfolio.",
      },
    }),
    // New leads
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "comet",
        client: "AI Startup",
        title: "Frontend Developer - AI Dashboard",
        description:
          "Early-stage AI startup building developer tools. Need someone to create intuitive interfaces for ML workflows.",
        requiredTechnologies: JSON.stringify(["React", "TypeScript", "Python"]),
        requiredDomains: JSON.stringify(["SaaS"]),
        location: "Remote",
        remotePolicy: "remote",
        offeredRate: 580,
        estimatedStartDate: new Date("2026-02-01"),
        estimatedDuration: 6,
        stage: "lead",
        matchScore: 72,
        contactName: "Jean-Luc Picard",
        contactInfo: "jl@aistartup.io",
      },
    }),
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "recruiter",
        client: "Insurance Corp",
        title: "Senior Developer",
        description:
          "Digital transformation project for insurance company. Legacy modernization with React and microservices.",
        requiredTechnologies: JSON.stringify(["React", "Java", "PostgreSQL"]),
        requiredDomains: JSON.stringify(["Insurance"]),
        location: "Paris",
        remotePolicy: "onsite",
        offeredRate: 650,
        estimatedStartDate: new Date("2026-04-01"),
        estimatedDuration: 18,
        stage: "lead",
        matchScore: 65,
        contactName: "Alice Recruiter",
        contactInfo: "alice@recruiters.fr",
        notes: "Java is not my strength. Need to evaluate if worth pursuing.",
      },
    }),
    // Lost lead
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "linkedin",
        client: "CryptoExchange",
        title: "Blockchain Developer",
        description: "Building decentralized exchange platform. Solidity and Web3 experience required.",
        requiredTechnologies: JSON.stringify(["Solidity", "Web3.js", "React"]),
        requiredDomains: JSON.stringify(["Crypto"]),
        location: "Remote",
        remotePolicy: "remote",
        offeredRate: 800,
        estimatedDuration: 12,
        stage: "lost",
        matchScore: 45,
        notes: "Declined - not enough blockchain experience. Rate was great though.",
      },
    }),
    // Auto-filtered lead (below minimum rate)
    prisma.lead.create({
      data: {
        profileId: profile.id,
        source: "freework",
        client: "Budget Startup",
        title: "React Developer",
        description: "Early stage startup looking for React developer. Limited budget but equity offered.",
        requiredTechnologies: JSON.stringify(["React", "Node.js"]),
        location: "Remote",
        remotePolicy: "remote",
        offeredRate: 400,
        estimatedDuration: 6,
        stage: "lost",
        matchScore: 35,
        autoFiltered: true,
        notes: "Auto-filtered: rate below minimum threshold.",
      },
    }),
  ]);

  console.log(`Created ${leads.length} leads`);

  // Create activities for some leads
  const activities = await Promise.all([
    // Activities for won lead (DataViz Pro)
    prisma.activity.create({
      data: {
        leadId: leads[0].id,
        type: "note",
        title: "Initial contact from referral",
        description: "Got intro from Marie at previous client. They're looking for senior frontend help.",
        occurredAt: new Date("2026-01-10T09:00:00"),
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[0].id,
        type: "call",
        title: "Discovery call with CTO",
        description: "Great conversation about the project. They want to build a new dashboard from scratch. Team seems solid.",
        occurredAt: new Date("2026-01-12T14:00:00"),
        duration: 45,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[0].id,
        type: "interview",
        title: "Technical interview",
        description: "Pair programming session went well. Solved a D3.js visualization challenge together.",
        occurredAt: new Date("2026-01-18T10:00:00"),
        duration: 90,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[0].id,
        type: "email",
        title: "Received offer",
        description: "680/day, 4 days/week, hybrid (2 days remote). Starting Feb 15.",
        occurredAt: new Date("2026-01-22T11:30:00"),
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[0].id,
        type: "meeting",
        title: "Contract negotiation meeting",
        description: "Discussed terms. Added clause for remote flexibility during school holidays.",
        occurredAt: new Date("2026-01-25T15:00:00"),
        duration: 60,
      },
    }),

    // Activities for negotiating lead (CloudScale)
    prisma.activity.create({
      data: {
        leadId: leads[1].id,
        type: "email",
        title: "Initial outreach on LinkedIn",
        description: "CTO reached out directly. Interesting project.",
        occurredAt: new Date("2026-01-15T10:00:00"),
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[1].id,
        type: "call",
        title: "Intro call",
        description: "Discussed project scope and team. They need help with scaling challenges.",
        occurredAt: new Date("2026-01-17T16:00:00"),
        duration: 30,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[1].id,
        type: "interview",
        title: "Technical deep dive",
        description: "Architecture review session. Their stack is solid. Some legacy debt to address.",
        occurredAt: new Date("2026-01-23T14:00:00"),
        duration: 75,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[1].id,
        type: "note",
        title: "Rate negotiation",
        description: "They offered 620, asked for 650. Waiting for response.",
        occurredAt: new Date("2026-01-26T09:00:00"),
      },
    }),

    // Activities for qualified lead (BankingTech)
    prisma.activity.create({
      data: {
        leadId: leads[2].id,
        type: "call",
        title: "Recruiter intro call",
        description: "Sophie from TechTalent presented the opportunity. High-profile fintech client.",
        occurredAt: new Date("2026-01-20T11:00:00"),
        duration: 20,
      },
    }),
    prisma.activity.create({
      data: {
        leadId: leads[2].id,
        type: "email",
        title: "Sent CV and portfolio",
        description: "Shared updated CV highlighting fintech experience.",
        occurredAt: new Date("2026-01-21T14:00:00"),
      },
    }),

    // Activity for new lead
    prisma.activity.create({
      data: {
        leadId: leads[4].id,
        type: "email",
        title: "Received job description",
        description: "Looks interesting but Python requirement might be a stretch.",
        occurredAt: new Date("2026-01-27T10:00:00"),
      },
    }),
  ]);

  console.log(`Created ${activities.length} activities`);

  // Create a sample document
  const document = await prisma.document.create({
    data: {
      leadId: leads[0].id,
      type: "cover_letter",
      content: `Dear Hiring Team at DataViz Pro,

I am writing to express my strong interest in the Senior Frontend Developer position. With 8 years of experience building complex web applications and a deep expertise in React and TypeScript, I am confident I would be a valuable addition to your team.

In my current role at FinanceFlow, I lead the development of a payment processing platform, where I've architected scalable solutions and mentored junior developers. My experience with data-intensive applications, including work with D3.js for visualization, aligns perfectly with your needs.

Key highlights of my background:
- Led development of real-time dashboards processing millions of data points
- Strong TypeScript advocate with focus on type safety and code quality
- Experience with hybrid team collaboration and remote-first practices

I am excited about the opportunity to contribute to DataViz Pro's mission of making data accessible and actionable. I look forward to discussing how my skills can benefit your team.

Best regards,
Alex Martin`,
      version: 1,
    },
  });

  console.log(`Created sample document`);

  console.log("\nSeed completed successfully!");
  console.log(`
Summary:
- 1 Profile (${profile.name})
- ${missions.length} Missions
- ${leads.length} Leads (various stages)
- ${activities.length} Activities
- 1 Document
  `);
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
