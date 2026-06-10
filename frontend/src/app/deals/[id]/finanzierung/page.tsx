import { CapitalStackView } from "../../../../components/CapitalStackView";

export default function Page({ params }: { params: { id: string } }) {
  return <CapitalStackView dealId={params.id} />;
}
