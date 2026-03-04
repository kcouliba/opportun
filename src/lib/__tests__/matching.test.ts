import { describe, it, expect } from 'vitest';
import { calculateMatchScore } from '../matching';

describe('calculateMatchScore', () => {
  // Default profile for testing
  const baseProfile = {
    technologies: ['React', 'TypeScript', 'Node.js'],
    domains: ['Fintech', 'E-commerce'],
    minimumTJM: 500,
    targetTJM: 700,
    preferredLocations: ['Paris', 'Remote'],
    blacklistedClients: ['BadCompany', 'AvoidCorp'],
    blacklistedDomains: ['Gambling', 'Tobacco'],
  };

  // Default lead for testing
  const baseLead = {
    requiredTechnologies: ['React', 'TypeScript'],
    requiredDomains: ['Fintech'],
    offeredRate: 600,
    location: 'Paris',
    client: 'GoodClient',
  };

  describe('Technology Matching', () => {
    it('should give full tech points for complete technology match', () => {
      const lead = {
        ...baseLead,
        requiredTechnologies: ['React', 'TypeScript'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      // Full match: 100% of 30 points = 30 points
      // Base: 50, Tech: 30, Domain: 15, Rate: 5 (acceptable), Location: 10 = 110 -> capped at 100
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.reasons).toContain('Tech match: React, TypeScript');
      expect(result.autoFiltered).toBe(false);
    });

    it('should give partial tech points for partial technology match', () => {
      const lead = {
        ...baseLead,
        requiredTechnologies: ['React', 'Python', 'Go', 'Rust'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      // 1/4 match = 25% of 30 = 7.5 -> 8 points
      expect(result.reasons).toContain('Tech match: React');
      expect(result.reasons.some((r) => r.includes('Missing:'))).toBe(true);
      expect(result.autoFiltered).toBe(false);
    });

    it('should give no tech points for no technology match', () => {
      const lead = {
        ...baseLead,
        requiredTechnologies: ['Python', 'Django', 'PostgreSQL'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      // No tech match, so base 50 + other bonuses
      expect(result.reasons.some((r) => r.includes('Tech match:'))).toBe(false);
      expect(result.reasons.some((r) => r.includes('Missing:'))).toBe(true);
      expect(result.autoFiltered).toBe(false);
    });

    it('should handle case-insensitive technology matching', () => {
      const lead = {
        ...baseLead,
        requiredTechnologies: ['react', 'TYPESCRIPT'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).toContain('Tech match: react, TYPESCRIPT');
    });
  });

  describe('Rate Filtering', () => {
    it('should auto-filter when rate is below minimum', () => {
      const lead = {
        ...baseLead,
        offeredRate: 400, // Below minimum of 500
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBe(0);
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Rate (400\u20AC) below minimum (500\u20AC)');
    });

    it('should not filter when rate is at minimum', () => {
      const lead = {
        ...baseLead,
        offeredRate: 500, // At minimum
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(false);
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons).toContain('Rate acceptable but below target');
    });

    it('should give bonus when rate meets target', () => {
      const lead = {
        ...baseLead,
        offeredRate: 700, // At target
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(false);
      expect(result.reasons).toContain('Rate meets target');
    });

    it('should give higher bonus when rate exceeds target', () => {
      const lead = {
        ...baseLead,
        offeredRate: 900, // Above target
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(false);
      expect(result.reasons).toContain('Rate meets target');
    });

    it('should handle null rate without filtering', () => {
      const lead = {
        ...baseLead,
        offeredRate: null,
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(false);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle null minimum TJM without filtering', () => {
      const profile = {
        ...baseProfile,
        minimumTJM: null,
      };
      const lead = {
        ...baseLead,
        offeredRate: 100, // Very low but no minimum set
      };
      const result = calculateMatchScore(profile, lead);

      expect(result.autoFiltered).toBe(false);
    });
  });

  describe('Blacklist Filtering', () => {
    it('should auto-filter blacklisted clients', () => {
      const lead = {
        ...baseLead,
        client: 'BadCompany Inc',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBe(0);
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Client is blacklisted');
    });

    it('should auto-filter with case-insensitive client matching', () => {
      const lead = {
        ...baseLead,
        client: 'BADCOMPANY LLC',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBe(0);
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Client is blacklisted');
    });

    it('should auto-filter blacklisted domains', () => {
      const lead = {
        ...baseLead,
        requiredDomains: ['Gambling', 'Sports'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBe(0);
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Domain is blacklisted');
    });

    it('should not filter non-blacklisted clients', () => {
      const lead = {
        ...baseLead,
        client: 'GoodCompany',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(false);
      expect(result.reasons).not.toContain('Client is blacklisted');
    });

    it('should not filter when blacklist is empty', () => {
      const profile = {
        ...baseProfile,
        blacklistedClients: [],
        blacklistedDomains: [],
      };
      const lead = {
        ...baseLead,
        client: 'AnyCompany',
        requiredDomains: ['Gambling'],
      };
      const result = calculateMatchScore(profile, lead);

      expect(result.autoFiltered).toBe(false);
    });
  });

  describe('Auto-filter Logic', () => {
    it('should return immediately on client blacklist hit', () => {
      const lead = {
        ...baseLead,
        client: 'BadCompany',
        offeredRate: 300, // Also below minimum
      };
      const result = calculateMatchScore(baseProfile, lead);

      // Should only mention blacklist, not rate
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Client is blacklisted');
      expect(result.reasons).not.toContain('Rate');
    });

    it('should return immediately on domain blacklist hit', () => {
      const lead = {
        ...baseLead,
        client: 'GoodCompany',
        requiredDomains: ['Gambling'],
        offeredRate: 300, // Also below minimum
      };
      const result = calculateMatchScore(baseProfile, lead);

      // Should only mention blacklist, not rate
      expect(result.autoFiltered).toBe(true);
      expect(result.reasons).toContain('Domain is blacklisted');
      expect(result.reasons.length).toBe(1);
    });

    it('should check rate after blacklist passes', () => {
      const lead = {
        ...baseLead,
        client: 'GoodCompany',
        requiredDomains: ['Fintech'],
        offeredRate: 300, // Below minimum
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.autoFiltered).toBe(true);
      expect(result.reasons.some((r) => r.includes('below minimum'))).toBe(true);
    });
  });

  describe('Domain Matching', () => {
    it('should give points for domain match', () => {
      const lead = {
        ...baseLead,
        requiredDomains: ['Fintech'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).toContain('Domain match: Fintech');
    });

    it('should handle case-insensitive domain matching', () => {
      const lead = {
        ...baseLead,
        requiredDomains: ['FINTECH', 'e-commerce'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons.some((r) => r.includes('Domain match:'))).toBe(true);
    });

    it('should not give domain points for no match', () => {
      const lead = {
        ...baseLead,
        requiredDomains: ['Healthcare'],
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons.some((r) => r.includes('Domain match:'))).toBe(false);
    });
  });

  describe('Location Matching', () => {
    it('should give points for location match', () => {
      const lead = {
        ...baseLead,
        location: 'Paris',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).toContain('Location matches preference');
    });

    it('should handle partial location matching', () => {
      const lead = {
        ...baseLead,
        location: 'Paris 8th',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).toContain('Location matches preference');
    });

    it('should not give location points for no match', () => {
      const lead = {
        ...baseLead,
        location: 'Lyon',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).not.toContain('Location matches preference');
    });

    it('should handle null location', () => {
      const lead = {
        ...baseLead,
        location: null,
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.reasons).not.toContain('Location matches preference');
      expect(result.autoFiltered).toBe(false);
    });
  });

  describe('Score Bounds', () => {
    it('should cap score at 100', () => {
      // Perfect match with all bonuses
      const lead = {
        requiredTechnologies: ['React', 'TypeScript', 'Node.js'],
        requiredDomains: ['Fintech'],
        offeredRate: 800,
        location: 'Paris',
        client: 'PerfectClient',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return 0 for auto-filtered leads', () => {
      const lead = {
        ...baseLead,
        client: 'BadCompany',
      };
      const result = calculateMatchScore(baseProfile, lead);

      expect(result.score).toBe(0);
    });

    it('should have a base score of at least 50 for non-filtered leads', () => {
      const profile = {
        technologies: [],
        domains: [],
        minimumTJM: null,
        targetTJM: null,
        preferredLocations: [],
        blacklistedClients: [],
        blacklistedDomains: [],
      };
      const lead = {
        requiredTechnologies: [],
        requiredDomains: [],
        offeredRate: null,
        location: null,
        client: 'SomeClient',
      };
      const result = calculateMatchScore(profile, lead);

      expect(result.score).toBe(50);
      expect(result.autoFiltered).toBe(false);
    });
  });
});
