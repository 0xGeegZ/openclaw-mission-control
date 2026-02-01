import { redirect } from "next/navigation";

interface AccountPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Account home page - redirects to tasks.
 */
export default async function AccountPage({ params }: AccountPageProps) {
  const { accountSlug } = await params;
  redirect(`/${accountSlug}/tasks`);
}
