import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl font-bold mb-2">Opportun</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Leads come to you, filtered and ready. One click to apply.
          </p>
        </header>

        {/* Quick Stats - Dashboard Preview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <DashboardCard
            title="Current Mission"
            value="No active mission"
            subtitle="Set up your current work"
            href="/missions"
            variant="warning"
          />
          <DashboardCard
            title="Pipeline"
            value="0 leads"
            subtitle="Add your first opportunity"
            href="/leads"
          />
          <DashboardCard
            title="Profile"
            value="Not set up"
            subtitle="Complete your profile to enable matching"
            href="/profile"
            variant="primary"
          />
        </section>

        {/* Getting Started */}
        <section className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Get Started</h2>
          <ol className="space-y-4">
            <Step number={1} title="Set up your profile" href="/profile">
              Add your skills, rate expectations, and deal-breakers.
              This powers the smart filtering.
            </Step>
            <Step number={2} title="Add your current mission" href="/missions/new">
              Track when your income stops so you know when to act.
            </Step>
            <Step number={3} title="Add leads to your pipeline" href="/leads/new">
              Manual entry for now. We&apos;ll match them against your profile.
            </Step>
            <Step number={4} title="Generate documents" href="/leads">
              One-click cover letters and key questions for qualified leads.
            </Step>
          </ol>
        </section>
      </div>
    </main>
  );
}

function DashboardCard({
  title,
  value,
  subtitle,
  href,
  variant = "default",
}: {
  title: string;
  value: string;
  subtitle: string;
  href: string;
  variant?: "default" | "primary" | "warning";
}) {
  const variantStyles = {
    default: "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
    primary: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    warning: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
  };

  return (
    <Link
      href={href}
      className={`block p-6 rounded-lg border ${variantStyles[variant]} hover:shadow-md transition-shadow`}
    >
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
        {title}
      </h3>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
    </Link>
  );
}

function Step({
  number,
  title,
  href,
  children,
}: {
  number: number;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center font-semibold">
        {number}
      </span>
      <div>
        <Link href={href} className="font-medium hover:text-blue-600 dark:hover:text-blue-400">
          {title}
        </Link>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{children}</p>
      </div>
    </li>
  );
}
