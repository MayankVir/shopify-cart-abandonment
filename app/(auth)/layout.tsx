export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Cart Recovery IVR
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Abandoned cart recovery for Shopify stores
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
