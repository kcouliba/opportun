/**
 * Calculate match score between a lead and a profile
 * Returns a score from 0-100
 */
export function calculateMatchScore(
  profile: {
    technologies: string[];
    domains: string[];
    minimumTJM: number | null;
    targetTJM: number | null;
    preferredLocations: string[];
    blacklistedClients: string[];
    blacklistedDomains: string[];
  },
  lead: {
    requiredTechnologies: string[];
    requiredDomains: string[];
    offeredRate: number | null;
    location: string | null;
    client: string;
  }
): { score: number; reasons: string[]; autoFiltered: boolean } {
  const reasons: string[] = [];
  let score = 50; // Base score
  let autoFiltered = false;

  // Check blacklist - automatic filter
  if (profile.blacklistedClients.length > 0) {
    const clientLower = lead.client.toLowerCase();
    if (profile.blacklistedClients.some((c) => clientLower.includes(c.toLowerCase()))) {
      reasons.push("Client is blacklisted");
      autoFiltered = true;
      return { score: 0, reasons, autoFiltered };
    }
  }

  if (profile.blacklistedDomains.length > 0 && lead.requiredDomains.length > 0) {
    const hasBlacklistedDomain = lead.requiredDomains.some((d) =>
      profile.blacklistedDomains.some((bd) => d.toLowerCase().includes(bd.toLowerCase()))
    );
    if (hasBlacklistedDomain) {
      reasons.push("Domain is blacklisted");
      autoFiltered = true;
      return { score: 0, reasons, autoFiltered };
    }
  }

  // Check minimum rate - automatic filter
  if (profile.minimumTJM && lead.offeredRate && lead.offeredRate < profile.minimumTJM) {
    reasons.push(`Rate (${lead.offeredRate}€) below minimum (${profile.minimumTJM}€)`);
    autoFiltered = true;
    return { score: 0, reasons, autoFiltered };
  }

  // Technology match (up to +30 points)
  if (profile.technologies.length > 0 && lead.requiredTechnologies.length > 0) {
    const profileTechLower = profile.technologies.map((t) => t.toLowerCase());
    const matchingTechs = lead.requiredTechnologies.filter((t) =>
      profileTechLower.includes(t.toLowerCase())
    );
    const techMatchRatio = matchingTechs.length / lead.requiredTechnologies.length;
    const techPoints = Math.round(techMatchRatio * 30);
    score += techPoints;

    if (matchingTechs.length > 0) {
      reasons.push(`Tech match: ${matchingTechs.join(", ")}`);
    }
    if (techMatchRatio < 0.5) {
      const missingTechs = lead.requiredTechnologies.filter(
        (t) => !profileTechLower.includes(t.toLowerCase())
      );
      reasons.push(`Missing: ${missingTechs.join(", ")}`);
    }
  }

  // Domain match (up to +15 points)
  if (profile.domains.length > 0 && lead.requiredDomains.length > 0) {
    const profileDomainLower = profile.domains.map((d) => d.toLowerCase());
    const matchingDomains = lead.requiredDomains.filter((d) =>
      profileDomainLower.includes(d.toLowerCase())
    );
    if (matchingDomains.length > 0) {
      score += 15;
      reasons.push(`Domain match: ${matchingDomains.join(", ")}`);
    }
  }

  // Rate bonus (up to +10 points)
  if (profile.targetTJM && lead.offeredRate) {
    if (lead.offeredRate >= profile.targetTJM) {
      score += 10;
      reasons.push("Rate meets target");
    } else if (profile.minimumTJM && lead.offeredRate >= profile.minimumTJM) {
      score += 5;
      reasons.push("Rate acceptable but below target");
    }
  }

  // Location match (up to +10 points)
  if (profile.preferredLocations.length > 0 && lead.location) {
    const locationLower = lead.location.toLowerCase();
    const locationMatch = profile.preferredLocations.some(
      (l) => locationLower.includes(l.toLowerCase()) || l.toLowerCase().includes(locationLower)
    );
    if (locationMatch) {
      score += 10;
      reasons.push("Location matches preference");
    }
  }

  // Cap score at 100
  score = Math.min(100, Math.max(0, score));

  return { score, reasons, autoFiltered };
}
