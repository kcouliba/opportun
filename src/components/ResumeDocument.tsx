import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { EducationEntry, Mission } from "@/types/index";

export interface ResumeData {
  name: string;
  title: string;
  location: string;
  bio: string;
  technologies: string[];
  domains: string[];
  languages: string[];
  education: EducationEntry[];
  missions: Mission[];
}

const BLUE = "#3d85a8";

const styles = StyleSheet.create({
  page: {
    padding: 45,
    paddingBottom: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#222",
    lineHeight: 1.5,
  },

  // Header
  name: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginBottom: 8,
  },
  contactLine: {
    fontSize: 9,
    color: "#555",
    marginBottom: 2,
  },

  // Sections
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    marginBottom: 6,
  },

  // Bio / summary
  bio: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#333",
  },

  // Skills
  skillRow: {
    flexDirection: "row" as const,
    marginBottom: 2,
  },
  skillLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    width: 100,
    color: "#333",
  },
  skillValue: {
    fontSize: 10,
    color: "#444",
    flex: 1,
  },

  // Experience
  missionBlock: {
    marginBottom: 10,
  },
  missionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: BLUE,
  },
  missionMeta: {
    fontSize: 9,
    color: "#555",
    marginBottom: 3,
  },
  bulletRow: {
    flexDirection: "row" as const,
    marginBottom: 1,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: "#555",
  },
  bulletText: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: "#333",
    flex: 1,
  },
  descriptionText: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: "#333",
    paddingLeft: 8,
  },

  // Education
  eduBlock: {
    marginBottom: 6,
  },
  eduTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: BLUE,
  },
  eduMeta: {
    fontSize: 9,
    color: "#555",
    marginBottom: 2,
  },
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Parse a description into bullet points.
 *
 * Recognizes lines starting with -, *, or bullet char as distinct bullets.
 * Consecutive plain lines (no bullet prefix) are joined into a single paragraph.
 * A blank line also forces a split.
 */
function parseDescription(text: string): { type: "bullet" | "paragraph"; text: string }[] {
  const lines = text.split("\n");
  const result: { type: "bullet" | "paragraph"; text: string }[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      result.push({ type: "paragraph", text: paragraphBuffer.join(" ") });
      paragraphBuffer = [];
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Check if line starts with a bullet marker
    const bulletMatch = trimmed.match(/^[\-\*\u2022\u2023\u25E6\u25AA\u25CF]\s*(.*)/);
    if (bulletMatch) {
      flushParagraph();
      result.push({ type: "bullet", text: bulletMatch[1].trim() });
    } else {
      paragraphBuffer.push(trimmed);
    }
  }
  flushParagraph();

  return result;
}

function DescriptionBlock({ text }: { text: string }) {
  const items = parseDescription(text);

  // If everything is plain paragraphs (no bullet markers found), show as plain text
  const hasBullets = items.some((i) => i.type === "bullet");
  if (!hasBullets) {
    return <Text style={styles.descriptionText}>{text}</Text>;
  }

  return (
    <>
      {items.map((item, i) =>
        item.type === "bullet" ? (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>&#8226;</Text>
            <Text style={styles.bulletText}>{item.text}</Text>
          </View>
        ) : (
          <Text key={i} style={styles.descriptionText}>{item.text}</Text>
        )
      )}
    </>
  );
}

export default function ResumeDocument({ data }: { data: ResumeData }) {
  const sortedMissions = [...data.missions].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  const contactParts = [
    data.location,
    data.languages.length > 0 ? data.languages.join(", ") : "",
  ].filter(Boolean);

  const skillCategories: { label: string; value: string }[] = [];
  if (data.technologies.length > 0) {
    skillCategories.push({ label: "Technologies", value: data.technologies.join(", ") });
  }
  if (data.domains.length > 0) {
    skillCategories.push({ label: "Domains", value: data.domains.join(", ") });
  }
  if (data.languages.length > 0) {
    skillCategories.push({ label: "Languages", value: data.languages.join(", ") });
  }

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View>
          <Text style={styles.name}>{data.name}</Text>
          {contactParts.length > 0 && (
            <Text style={styles.contactLine}>
              {contactParts.join("  |  ")}
            </Text>
          )}
          {data.title && (
            <Text style={styles.contactLine}>{data.title}</Text>
          )}
        </View>

        {/* Profile / Summary */}
        {data.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <Text style={styles.bio}>{data.bio}</Text>
          </View>
        )}

        {/* Experience */}
        {sortedMissions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {sortedMissions.map((mission) => (
              <View key={mission.id} style={styles.missionBlock} wrap={false}>
                <Text style={styles.missionTitle}>
                  {mission.title}
                </Text>
                <Text style={styles.missionMeta}>
                  {mission.client}  |  {formatDate(mission.startDate)}
                  {" - "}
                  {mission.endDate ? formatDate(mission.endDate) : "Present"}
                </Text>
                {mission.description && (
                  <DescriptionBlock text={mission.description} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {data.education.map((entry, i) => {
              const meta = [entry.degree, entry.field, entry.endYear]
                .filter(Boolean)
                .join("  |  ");
              return (
                <View key={i} style={styles.eduBlock}>
                  <Text style={styles.eduTitle}>{entry.school}</Text>
                  {meta && <Text style={styles.eduMeta}>{meta}</Text>}
                </View>
              );
            })}
          </View>
        )}

        {/* Skills */}
        {skillCategories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {skillCategories.map((cat, i) => (
              <View key={i} style={styles.skillRow}>
                <Text style={styles.skillLabel}>{cat.label}</Text>
                <Text style={styles.skillValue}>{cat.value}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
