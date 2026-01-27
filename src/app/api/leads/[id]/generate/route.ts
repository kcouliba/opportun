import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Generate documents for a lead
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { type } = await request.json();

  // Get the lead
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { profile: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Parse profile data
  const profile = lead.profile;
  const technologies = profile.technologies ? JSON.parse(profile.technologies) : [];
  const domains = profile.domains ? JSON.parse(profile.domains) : [];

  // Parse lead data
  const requiredTechnologies = lead.requiredTechnologies
    ? JSON.parse(lead.requiredTechnologies)
    : [];
  const requiredDomains = lead.requiredDomains ? JSON.parse(lead.requiredDomains) : [];

  // Find matching technologies
  const matchingTechs = requiredTechnologies.filter((t: string) =>
    technologies.some((pt: string) => pt.toLowerCase() === t.toLowerCase())
  );

  let content = "";

  if (type === "cover_letter") {
    content = generateCoverLetter({
      profileName: profile.name,
      profileTitle: profile.title || "Developer",
      yearsExperience: profile.yearsExperience,
      technologies,
      domains,
      leadTitle: lead.title,
      leadClient: lead.client,
      leadDescription: lead.description,
      requiredTechnologies,
      matchingTechs,
      remotePolicy: lead.remotePolicy,
    });
  } else if (type === "key_questions") {
    content = generateKeyQuestions({
      profileName: profile.name,
      profileTitle: profile.title || "Developer",
      yearsExperience: profile.yearsExperience,
      technologies,
      matchingTechs,
      targetTJM: profile.targetTJM,
      leadTitle: lead.title,
      leadClient: lead.client,
      offeredRate: lead.offeredRate,
      remotePolicy: lead.remotePolicy,
      estimatedStartDate: lead.estimatedStartDate,
    });
  } else {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  // Save the document
  const document = await prisma.document.create({
    data: {
      leadId: id,
      type,
      content,
    },
  });

  return NextResponse.json(document);
}

function generateCoverLetter({
  profileName,
  profileTitle,
  yearsExperience,
  technologies,
  domains,
  leadTitle,
  leadClient,
  leadDescription,
  requiredTechnologies,
  matchingTechs,
  remotePolicy,
}: {
  profileName: string;
  profileTitle: string;
  yearsExperience: number | null;
  technologies: string[];
  domains: string[];
  leadTitle: string;
  leadClient: string;
  leadDescription: string | null;
  requiredTechnologies: string[];
  matchingTechs: string[];
  remotePolicy: string | null;
}): string {
  const experienceText = yearsExperience
    ? `with ${yearsExperience}+ years of experience`
    : "";

  const techHighlight =
    matchingTechs.length > 0
      ? `I have hands-on experience with ${matchingTechs.join(", ")}, which aligns directly with your requirements.`
      : technologies.length > 0
      ? `My technical stack includes ${technologies.slice(0, 5).join(", ")}.`
      : "";

  const domainText =
    domains.length > 0
      ? `I've worked across ${domains.slice(0, 3).join(", ")} domains.`
      : "";

  const remoteText =
    remotePolicy === "remote"
      ? "I'm fully set up for remote work and experienced in async collaboration."
      : remotePolicy === "hybrid"
      ? "I'm comfortable with hybrid arrangements and can adapt to your on-site requirements."
      : "";

  return `Dear ${leadClient} Team,

I am writing to express my strong interest in the ${leadTitle} position.

As a ${profileTitle} ${experienceText}, I believe I would be a valuable addition to your team.

${techHighlight}

${domainText}

${remoteText}

I am excited about the opportunity to contribute to ${leadClient} and would welcome the chance to discuss how my skills and experience align with your needs.

Best regards,
${profileName}

---
Note: This is a generated template. Please personalize before sending.`;
}

function generateKeyQuestions({
  profileName,
  profileTitle,
  yearsExperience,
  technologies,
  matchingTechs,
  targetTJM,
  leadTitle,
  leadClient,
  offeredRate,
  remotePolicy,
  estimatedStartDate,
}: {
  profileName: string;
  profileTitle: string;
  yearsExperience: number | null;
  technologies: string[];
  matchingTechs: string[];
  targetTJM: number | null;
  leadTitle: string;
  leadClient: string;
  offeredRate: number | null;
  remotePolicy: string | null;
  estimatedStartDate: Date | null;
}): string {
  const experienceText = yearsExperience ? `${yearsExperience}+` : "several";

  const relevantTechs =
    matchingTechs.length > 0 ? matchingTechs : technologies.slice(0, 5);

  const availabilityText = estimatedStartDate
    ? `I am available to start from ${estimatedStartDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : "I am flexible on the start date and can discuss timing based on your needs.";

  const rateText =
    offeredRate && targetTJM
      ? offeredRate >= targetTJM
        ? `The proposed rate of ${offeredRate}€/day works for me.`
        : `My target rate is ${targetTJM}€/day. I'm open to discussing the proposed ${offeredRate}€/day based on the full scope of the role.`
      : targetTJM
      ? `My target rate is ${targetTJM}€/day, negotiable based on the role scope.`
      : "I'm open to discussing rate based on the full scope of the engagement.";

  return `# Prepared Answers for ${leadTitle} at ${leadClient}

## "Tell me about yourself / Why are you interested in this role?"

I'm ${profileName}, a ${profileTitle} with ${experienceText} years of experience. I'm particularly interested in this role at ${leadClient} because it aligns well with my expertise in ${relevantTechs.slice(0, 3).join(", ")}.

I thrive in environments where I can deliver impact while continuing to grow technically. This opportunity seems to offer both.

---

## "What's your experience with [required technologies]?"

${relevantTechs
  .map(
    (tech) =>
      `**${tech}:** I have production experience with ${tech}. [Add specific project or achievement here]`
  )
  .join("\n\n")}

---

## "What's your availability and rate?"

${availabilityText}

${rateText}

---

## "What's your preferred work setup?"

${
  remotePolicy === "remote"
    ? "I'm fully equipped for remote work with a dedicated home office, reliable internet, and experience with async communication tools (Slack, Notion, etc.)."
    : remotePolicy === "hybrid"
    ? "I'm comfortable with hybrid arrangements. I appreciate face-to-face collaboration for certain activities while valuing the focus time that remote work provides."
    : "I'm flexible and can adapt to on-site requirements. I understand the value of in-person collaboration, especially during onboarding and key project phases."
}

---

## "Do you have any questions for us?"

Suggested questions to ask:
1. What does success look like in the first 3 months?
2. What's the team structure and who would I be working closely with?
3. What's the biggest challenge the team is currently facing?
4. Is there potential for extension beyond the initial contract?

---
*Generated for ${profileName} | Customize before your interview*`;
}
