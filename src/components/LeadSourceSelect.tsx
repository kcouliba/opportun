import { useLeadSources } from "@/hooks/useLeadSources";

interface LeadSourceSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function LeadSourceSelect({ value, onChange, className }: LeadSourceSelectProps) {
  const { sources, loading } = useLeadSources();

  if (loading) {
    return (
      <select value={value} disabled className={className}>
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {sources.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </option>
      ))}
    </select>
  );
}
