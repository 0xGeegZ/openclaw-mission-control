import { DocumentRedirect } from "@/components/docs/DocumentRedirect";

interface DocumentRedirectPageProps {
  params: Promise<{ documentId: string }>;
}

/**
 * Redirects /document/[documentId] to /[accountSlug]/docs/[documentId].
 * Supports agent-style links like [Document](/document/<documentId>).
 */
export default async function DocumentRedirectPage({
  params,
}: DocumentRedirectPageProps) {
  const { documentId } = await params;
  return <DocumentRedirect documentId={documentId} />;
}
