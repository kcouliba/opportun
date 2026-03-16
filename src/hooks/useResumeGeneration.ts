import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/Toast";
import ResumeDocument from "@/components/ResumeDocument";
import type { ResumeData } from "@/components/ResumeDocument";
import type { Mission, EducationEntry } from "@/types/index";

interface ProfileInput {
  name: string;
  title: string;
  bio: string;
  technologies: string[];
  domains: string[];
  preferredLocations: string[];
  languages: string[];
  education: EducationEntry[];
}

export function useResumeGeneration() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);

  const generateResume = async (profile: ProfileInput) => {
    setGenerating(true);
    try {
      const missions = await invoke<Mission[]>("list_missions");

      const data: ResumeData = {
        name: profile.name,
        title: profile.title,
        location: profile.preferredLocations.join(", "),
        bio: profile.bio,
        technologies: profile.technologies,
        domains: profile.domains,
        languages: profile.languages,
        education: profile.education,
        missions,
      };

      const blob = await pdf(createElement(ResumeDocument, { data }) as any).toBlob();

      const filePath = await save({
        defaultPath: `${profile.name.replace(/\s+/g, "_")}_Resume.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!filePath) {
        setGenerating(false);
        return;
      }

      const arrayBuffer = await blob.arrayBuffer();
      await writeFile(filePath, new Uint8Array(arrayBuffer));

      showToast(t("profile.resumeExported"), "success");
    } catch (err) {
      console.error("Resume generation failed:", err);
      showToast(t("profile.failedExportResume"), "error");
    } finally {
      setGenerating(false);
    }
  };

  return { generateResume, generating };
}
