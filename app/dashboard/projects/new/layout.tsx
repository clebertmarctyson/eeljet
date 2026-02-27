import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deploy New Project",
  description:
    "Create a new subdomain deployment. Configure DNS records and Nginx reverse proxy automatically.",
  openGraph: {
    title: "Deploy New Project | EelJet",
    description:
      "Create a new subdomain deployment. Configure DNS records and Nginx reverse proxy automatically.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Deploy New Project | EelJet",
    description:
      "Create a new subdomain deployment. Configure DNS records and Nginx reverse proxy automatically.",
    images: ["/twitter-image.png"],
  },
};

export default function NewProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
