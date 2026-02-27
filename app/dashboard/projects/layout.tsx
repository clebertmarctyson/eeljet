import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "View and manage your deployed subdomain projects. Monitor status, visit live sites, and remove deployments.",
  openGraph: {
    title: "Projects | EelJet",
    description:
      "View and manage your deployed subdomain projects. Monitor status, visit live sites, and remove deployments.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Projects | EelJet",
    description:
      "View and manage your deployed subdomain projects. Monitor status, visit live sites, and remove deployments.",
    images: ["/twitter-image.png"],
  },
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
