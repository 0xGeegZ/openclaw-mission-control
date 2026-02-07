import { DocumentRedirect } from "@/components/docs/DocumentRedirect";

interface DocsRedirectPageProps {
  params: Promise<{ documentId: string }>;
}

/**
 * Redirects /docs/[documentId] to /[accountSlug]/docs/[documentId].
 * Allows document links that omit the account slug to still work.
 */
export default async function DocsRedirectPage({
  params,
}: DocsRedirectPageProps) {
  const { documentId } = await params;
  return <DocumentRedirect documentId={documentId} />;
}
