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

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    lineHeight: 1.5,
  },
  name: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  title: {
    fontSize: 12,
    color: "#555",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#777",
  },
  rule: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
    marginTop: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 6,
    color: "#333",
  },
  text: {
    fontSize: 10,
    lineHeight: 1.6,
  },
  missionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  missionMeta: {
    fontSize: 9,
    color: "#555",
    marginBottom: 2,
  },
  missionDescription: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#333",
  },
  missionBlock: {
    marginBottom: 8,
  },
  eduBlock: {
    marginBottom: 4,
  },
  eduSchool: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  eduDetail: {
    fontSize: 9,
    color: "#555",
  },
});

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function ResumeDocument({ data }: { data: ResumeData }) {
  const sortedMissions = [...data.missions].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View>
          <Text style={styles.name}>{data.name}</Text>
          {data.title && <Text style={styles.title}>{data.title}</Text>}
          {(data.location || data.languages.length > 0) && (
            <Text style={styles.subtitle}>
              {[data.location, data.languages.length > 0 ? data.languages.join(", ") : ""]
                .filter(Boolean)
                .join("  |  ")}
            </Text>
          )}
        </View>

        {/* Summary */}
        {data.bio && (
          <>
            <View style={styles.rule} />
            <View>
              <Text style={styles.sectionTitle}>Summary</Text>
              <Text style={styles.text}>{data.bio}</Text>
            </View>
          </>
        )}

        {/* Skills */}
        {(data.technologies.length > 0 || data.domains.length > 0) && (
          <>
            <View style={styles.rule} />
            <View>
              <Text style={styles.sectionTitle}>Skills</Text>
              {data.technologies.length > 0 && (
                <Text style={styles.text}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Technologies: </Text>
                  {data.technologies.join(", ")}
                </Text>
              )}
              {data.domains.length > 0 && (
                <Text style={styles.text}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>Domains: </Text>
                  {data.domains.join(", ")}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Experience */}
        {sortedMissions.length > 0 && (
          <>
            <View style={styles.rule} />
            <View>
              <Text style={styles.sectionTitle}>Experience</Text>
              {sortedMissions.map((mission) => (
                <View key={mission.id} style={styles.missionBlock}>
                  <Text style={styles.missionTitle}>{mission.title}</Text>
                  <Text style={styles.missionMeta}>
                    {mission.client}  |  {formatDate(mission.startDate)}
                    {" - "}
                    {mission.endDate ? formatDate(mission.endDate) : "Present"}
                  </Text>
                  {mission.description && (
                    <Text style={styles.missionDescription}>
                      {mission.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <>
            <View style={styles.rule} />
            <View>
              <Text style={styles.sectionTitle}>Education</Text>
              {data.education.map((entry, i) => (
                <View key={i} style={styles.eduBlock}>
                  <Text style={styles.eduSchool}>{entry.school}</Text>
                  <Text style={styles.eduDetail}>
                    {[entry.degree, entry.field, entry.endYear]
                      .filter(Boolean)
                      .join("  |  ")}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}
