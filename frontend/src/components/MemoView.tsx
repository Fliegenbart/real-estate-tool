"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getInvestmentMemo } from "../lib/api";
import { InvestmentMemo } from "../lib/types";

export function MemoView({ dealId }: { dealId: string }) {
  const [memo, setMemo] = useState<InvestmentMemo | null>(null);

  useEffect(() => {
    getInvestmentMemo(dealId).then(setMemo);
  }, [dealId]);

  if (!memo) {
    return <div className="page"><div className="panel">Lade Memo...</div></div>;
  }

  return (
    <div className="page memo-page">
      <section className="deal-header">
        <div>
          <Link href={`/deals/${memo.deal_id}`} className="text-link">Deal</Link>
          <h2>{memo.title}</h2>
        </div>
        <button className="button" onClick={() => window.print()}>
          <Printer size={16} />
          Drucken
        </button>
      </section>
      <article className="memo-document">
        {memo.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}
