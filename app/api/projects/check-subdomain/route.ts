import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSubdomainAvailable } from "@/lib/services/subdomain-deployer";

function generateSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * GET /api/projects/check-subdomain?subdomain=abc
 * Checks if a subdomain is available. If not, suggests an alternative.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subdomain = request.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return NextResponse.json(
      { error: "subdomain query parameter is required" },
      { status: 400 },
    );
  }

  const available = await isSubdomainAvailable(subdomain);
  if (available) {
    return NextResponse.json({ available: true });
  }

  // Generate a suggestion: base-<random 4 chars>
  // Try up to 5 times to find an available one
  for (let i = 0; i < 5; i++) {
    const suggestion = `${subdomain}-${generateSuffix()}`;
    if (suggestion.length <= 63 && (await isSubdomainAvailable(suggestion))) {
      return NextResponse.json({ available: false, suggestion });
    }
  }

  return NextResponse.json({ available: false });
}
