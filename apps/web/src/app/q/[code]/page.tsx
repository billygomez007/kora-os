import { notFound, redirect } from 'next/navigation';

type QrResolution = {
  data: {
    code: string;
    type: string;
    organizationId: string;
    businessName: string;
    storefrontSlug: string;
    branchId: string | null;
    branchName: string | null;
    label: string | null;
    resourceKey: string | null;
    destination: string;
  };
};

type PageProps = {
  params: Promise<{
    code: string;
  }>;
};

function getApiUrl(): string {
  const value = process.env.NEXT_PUBLIC_KORA_API_URL;

  if (!value) {
    throw new Error('NEXT_PUBLIC_KORA_API_URL is not configured');
  }

  return value.replace(/\/+$/, '');
}

export default async function QrRedirectPage({ params }: PageProps) {
  const { code } = await params;

  if (!code || !code.startsWith('kora_')) {
    notFound();
  }

  const response = await fetch(
    `${getApiUrl()}/v1/q/${encodeURIComponent(code)}`,
    {
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(`QR resolution failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as QrResolution;
  const destination = payload.data?.destination;

  if (
    !destination ||
    !destination.startsWith('/marketplace/') ||
    destination.startsWith('//')
  ) {
    notFound();
  }

  redirect(destination);
}
