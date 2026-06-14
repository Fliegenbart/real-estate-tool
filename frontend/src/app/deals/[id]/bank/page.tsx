import { BankPackageView } from "../../../../components/BankPackageView";

export default function Page({ params }: { params: { id: string } }) {
  return <BankPackageView dealId={params.id} />;
}
