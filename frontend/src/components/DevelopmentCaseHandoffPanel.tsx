import React from "react";
import type { DevelopmentCaseHandoffBrief } from "../lib/dealMetrics";

type DevelopmentCaseHandoffPanelProps = {
  brief: DevelopmentCaseHandoffBrief;
  ariaLabel: string;
  kicker: string;
  ruleTitle: string;
  proofTitle: string;
};

export function DevelopmentCaseHandoffPanel({
  brief,
  ariaLabel,
  kicker,
  ruleTitle,
  proofTitle
}: DevelopmentCaseHandoffPanelProps) {
  return (
    <section className={`development-case-handoff ${brief.tone}`} aria-label={ariaLabel}>
      <div className="development-case-handoff-copy">
        <span className="section-kicker">{kicker}</span>
        <h4>{brief.headline}</h4>
        <p>{brief.summary}</p>
      </div>

      <div className="development-case-handoff-facts">
        {brief.facts.map((fact) => (
          <div className={`development-case-handoff-fact ${fact.tone}`} key={`${ariaLabel}-${fact.label}`}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
      </div>

      <div className="development-case-handoff-detail">
        <div>
          <h5>{ruleTitle}</h5>
          <p>{brief.guardrail}</p>
        </div>
        <div>
          <h5>{proofTitle}</h5>
          <ul className="plain-list">
            {brief.requiredProofs.map((proof) => (
              <li key={`${ariaLabel}-${proof}`}>{proof}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
