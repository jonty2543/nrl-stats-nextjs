import Link from "next/link";
import type { ReactNode } from "react";

export const BILLING_PAGE_HREF = "/dashboard/billing";

interface BillingPageLinkProps {
  children: ReactNode;
  className?: string;
  href?: string;
}

export function BillingPageLink({
  children,
  className,
  href = BILLING_PAGE_HREF,
}: BillingPageLinkProps) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
