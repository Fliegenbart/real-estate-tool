"use client";

import { ArrowLeft, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getBankPackage } from "../lib/api";
import { formatCurrency, formatNumber, formatPercent } from "../lib/dealMetrics";
import { BankPackage } from "../lib/types";

export function BankPackageView({ dealId }: { dealId: string }) {
  const [bankPackage, setBankPackage] = useState<BankPackage | null>(null);

  useEffect(() => {
    getBankPackage(dealId).then(setBankPackage);
  }, [dealId]);

  if (!bankPackage) {
    return <div className="page"><div className="panel">Lade Bankenpaket...</div></div>;
  }

  return (
    <div className="page bank-package-page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${bankPackage.deal_id}`} className="text-link">
            <ArrowLeft size={14} />
            Deal
          </Link>
          <h2>Bankenpaket</h2>
          <p>{bankPackage.title}</p>
        </div>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} />
          Drucken / PDF
        </button>
      </section>

      <section className="memo-document bank-package">
        <div className="bank-package-title">
          <FileText size={22} />
          <div>
            <h2>{bankPackage.title}</h2>
            <p>Finanzierungs- und Diligence-Unterlage</p>
          </div>
        </div>

        <section>
          <h3>Bank summary</h3>
          <div className="fact-grid">
            <Fact label="Kaufpreis" value={formatMoneyValue(bankPackage.bank_summary.purchase_price)} />
            <Fact label="All-in" value={formatMoneyValue(bankPackage.bank_summary.all_in_purchase_price)} />
            <Fact label="Eigenkapital" value={formatMoneyValue(bankPackage.bank_summary.equity_required)} />
            <Fact label="NOI" value={formatMoneyValue(bankPackage.bank_summary.net_operating_income)} />
            <Fact label="Nettorendite" value={formatPercentValue(bankPackage.bank_summary.net_initial_yield_percent)} />
            <Fact label="DSCR" value={formatPlainValue(bankPackage.bank_summary.dscr)} />
            <Fact label="Cashflow" value={formatMoneyValue(bankPackage.bank_summary.monthly_cashflow_before_tax)} />
            <Fact label="Score" value={formatPlainValue(bankPackage.bank_summary.score)} />
          </div>
        </section>

        <section>
          <h3>Finanzierungswunsch</h3>
          <div className="fact-grid">
            <Fact label="Darlehen" value={formatMoneyValue(bankPackage.financing_request.requested_loan_amount)} />
            <Fact label="Eigenmittel" value={formatMoneyValue(bankPackage.financing_request.suggested_equity)} />
            <Fact label="Finanzierte Sanierung" value={formatMoneyValue(bankPackage.financing_request.financed_capex)} />
            <Fact label="Stress-Cashflow" value={formatMoneyValue(bankPackage.financing_request.stressed_monthly_cashflow_before_tax)} />
          </div>
        </section>

        <section className="risk-grid">
          <div>
            <h3>Staerken</h3>
            <ul className="plain-list">
              {(bankPackage.strengths.length ? bankPackage.strengths : ["Noch keine Staerken im Score hinterlegt."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Risiken</h3>
            <ul className="plain-list">
              {(bankPackage.risks.length ? bankPackage.risks : ["Keine Score-Risiken hinterlegt."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h3>Fehlende Bankunterlagen</h3>
          <div className="document-chip-list">
            {bankPackage.missing_documents.map((item) => (
              <span className="tag" key={item}>{item.replaceAll("_", " ")}</span>
            ))}
            {bankPackage.missing_documents.length === 0 && <span className="tag">vollstaendig</span>}
          </div>
        </section>

        {bankPackage.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <ul className="plain-list">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}

        <p className="tax-warning">{bankPackage.disclaimer}</p>
      </section>
    </div>
  );
}

function formatMoneyValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatCurrency(value) : "Fehlt";
}

function formatPercentValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatPercent(value) : "Fehlt";
}

function formatPlainValue(value: number | string | null | undefined): string {
  return typeof value === "number" ? formatNumber(value) : value ? String(value) : "Fehlt";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
