"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { getRiskMatrix } from "../lib/api";
import { RiskMatrix } from "../lib/types";

export function RiskMatrixPanel({ dealId, scoreVersion }: { dealId: number; scoreVersion: string }) {
  const [matrix, setMatrix] = useState<RiskMatrix | null>(null);

  useEffect(() => {
    getRiskMatrix(dealId).then(setMatrix).catch(() => setMatrix(null));
  }, [dealId, scoreVersion]);

  if (!matrix) {
    return null;
  }

  return (
    <div className="panel wide">
      <div className="panel-header">
        <h2>Risiken & Mitigation</h2>
        <span className="tag">
          <ShieldAlert size={14} /> {matrix.high_count} hoch · {matrix.medium_count} mittel
        </span>
      </div>
      <p className="recommendation">{matrix.summary}</p>
      <div className="argument-list">
        {matrix.items.map((item) => (
          <div className={`argument strength-${item.severity === "high" ? "hard" : "medium"}`} key={item.code}>
            <div className="argument-head">
              <strong>{item.title}</strong>
              <span className="tag">{item.severity}</span>
            </div>
            <p className="argument-evidence">{item.explanation}</p>
            {item.due_diligence_actions.length > 0 && (
              <p className="argument-evidence"><strong>Pruefen:</strong> {item.due_diligence_actions.join(" · ")}</p>
            )}
            {item.mitigations.length > 0 && (
              <p className="argument-evidence"><strong>Mitigation:</strong> {item.mitigations.join(" · ")}</p>
            )}
            {item.price_consequence && (
              <p className="argument-script">Preisfolge: {item.price_consequence}</p>
            )}
          </div>
        ))}
        {matrix.items.length === 0 && <p>Keine geflaggten Risiken - Scoring laufen lassen, falls noch nicht geschehen.</p>}
      </div>
    </div>
  );
}
