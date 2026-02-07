"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import type { InvoiceSummary } from "@packages/shared/types/billing";

interface InvoiceListProps {
  invoices: InvoiceSummary[];
}

/**
 * InvoiceList component for displaying billing history.
 * Shows invoice date, amount, status, and download links.
 */
export function InvoiceList({ invoices }: InvoiceListProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100); // Stripe amounts are in cents
  };

  /**
   * Choose the amount to display based on invoice status.
   */
  const getDisplayAmount = (invoice: InvoiceSummary) => {
    return invoice.status === "paid" ? invoice.amountPaid : invoice.amountDue;
  };

  const getStatusColor = (status: InvoiceSummary["status"]) => {
    switch (status) {
      case "paid":
        return "text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-500/10";
      case "open":
        return "text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-500/10";
      case "void":
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10";
      case "uncollectible":
        return "text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-500/10";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  if (invoices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>No invoices yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Your invoice history will appear here once you have an active
            subscription.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>View and download your invoices</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">
                    {format(invoice.date, "MMM dd, yyyy")}
                  </p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(
                      invoice.status,
                    )}`}
                  >
                    {invoice.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Invoice #{invoice.id.slice(-8)}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold">
                  {formatCurrency(getDisplayAmount(invoice), invoice.currency)}
                </p>

                <div className="flex items-center gap-2">
                  {invoice.hostedInvoiceUrl && (
                    <Button variant="ghost" size="sm" asChild className="h-8">
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">View invoice</span>
                      </a>
                    </Button>
                  )}
                  {invoice.invoicePdf && (
                    <Button variant="ghost" size="sm" asChild className="h-8">
                      <a
                        href={invoice.invoicePdf}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Download PDF</span>
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
