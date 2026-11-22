import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import jsPDF from "jspdf";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITE } from "@/lib/site";
import { naira, pctChange, topTests, type Invoice, type Payment, type Expense } from "@/lib/accounting";

type PL = { gross: number; discounts: number; netBilled: number; collected: number; cogs: number; opex: number; grossMargin: number; netProfit: number };

const fmtPct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}%`);

export function MoMCards({ cur, prev }: { cur: PL; prev: PL }) {
  const rows: [string, number, number, boolean][] = [
    ["Net revenue", cur.netBilled, prev.netBilled, true],
    ["Cash collected", cur.collected, prev.collected, true],
    ["Expenses", cur.cogs + cur.opex, prev.cogs + prev.opex, false],
    ["Net profit", cur.netProfit, prev.netProfit, true],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {rows.map(([l, c, p, upGood]) => {
        const ch = pctChange(c, p);
        const good = ch === null ? undefined : (ch >= 0) === upGood;
        return (
          <Card key={l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l} vs last month</div>
            <div className={`text-lg font-bold ${good === undefined ? "" : good ? "text-primary" : "text-destructive"}`}>{fmtPct(ch)}</div>
            <div className="text-xs text-muted-foreground">Last month {naira(p)}</div>
          </CardContent></Card>
        );
      })}
    </div>
  );
}

export function DeptChart({ data }: { data: [string, number][] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">No invoices this month.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.map(([name, value]) => ({ name, value }))} layout="vertical" margin={{ left: 20 }}>
        <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => naira(v)} />
        <Bar dataKey="value" fill="hsl(var(--primary))" radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ ym, prevYm, cur, prev }: { ym: string; prevYm: string; cur: PL; prev: PL }) {
  const data = [prevYm, ym].map((m, i) => { const p = i ? cur : prev; return { month: m, Revenue: p.netBilled, Collected: p.collected, Expenses: p.cogs + p.opex, Profit: p.netProfit }; });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}><XAxis dataKey="month" /><YAxis hide /><Tooltip formatter={(v: number) => naira(v)} /><Legend />
        <Bar dataKey="Revenue" fill="hsl(var(--primary))" /><Bar dataKey="Collected" fill="hsl(var(--accent-foreground))" />
        <Bar dataKey="Expenses" fill="hsl(var(--destructive))" /><Bar dataKey="Profit" fill="hsl(var(--muted-foreground))" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopTests({ invoices }: { invoices: Invoice[] }) {
  const rows = topTests(invoices);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Test</TableHead><TableHead className="text-right">Volume</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No tests this month.</TableCell></TableRow>}
        {rows.map((r) => <TableRow key={r.name}><TableCell>{r.name}<div className="text-xs text-muted-foreground">{r.department}</div></TableCell><TableCell className="text-right">{r.volume}</TableCell><TableCell className="text-right">{naira(r.revenue)}</TableCell></TableRow>)}
      </TableBody>
    </Table>
  );
}

const csvDownload = (name: string, rows: (string | number)[][]) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; a.click();
};

/** QuickBooks / Xero friendly journal: Date, Reference, Account, Description, Debit, Credit. */
function accountantCsv(ym: string, invoices: Invoice[], payments: Payment[], expenses: Expense[]) {
  const rows: (string | number)[][] = [["Date", "Reference", "Account", "Description", "Debit", "Credit"]];
  for (const i of invoices) if (i.status !== "Void") {
    const d = i.created_at.slice(0, 10);
    rows.push([d, i.invoice_number, "Accounts Receivable", i.patient_name, Number(i.total).toFixed(2), ""]);
    rows.push([d, i.invoice_number, "Sales - Lab Services", i.patient_name, "", Number(i.total).toFixed(2)]);
  }
  for (const p of payments) {
    const d = p.created_at.slice(0, 10); const acct = p.method === "Cash" ? "Cash on Hand" : "Bank";
    rows.push([d, p.reference ?? p.id.slice(0, 8), acct, `Payment (${p.method})`, Number(p.amount).toFixed(2), ""]);
    rows.push([d, p.reference ?? p.id.slice(0, 8), "Accounts Receivable", `Payment (${p.method})`, "", Number(p.amount).toFixed(2)]);
  }
  for (const e of expenses) {
    const acct = e.method === "Cash" ? "Cash on Hand" : "Bank";
    rows.push([e.expense_date, e.expense_number, e.category, `${e.vendor ?? ""} ${e.description ?? ""}`.trim(), Number(e.amount).toFixed(2), ""]);
    rows.push([e.expense_date, e.expense_number, acct, e.vendor ?? "", "", Number(e.amount).toFixed(2)]);
  }
  csvDownload(`journal-${ym}.csv`, rows);
}

function executivePdf(ym: string, cur: PL, prev: PL, dept: [string, number][], invoices: Invoice[], receivable: number, aging: Record<string, number>) {
  const doc = new jsPDF(); let y = 18;
  const line = (l: string, r = "", bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(l, 14, y); if (r) doc.text(r, 196, y, { align: "right" }); y += 7; };
  const money = (n: number) => "NGN " + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  doc.setFontSize(16); line(SITE.name ?? "Green Medical Diagnostics", "", true);
  doc.setFontSize(11); line(`Executive Financial Summary — ${ym}`); y += 3;
  line("Profit & Loss", "", true);
  ([["Gross revenue", cur.gross], ["Less discounts", -cur.discounts], ["Net revenue", cur.netBilled], ["Cost of tests", -cur.cogs], ["Gross margin", cur.grossMargin], ["Operating expenses", -cur.opex], ["Net profit", cur.netProfit], ["Cash collected", cur.collected]] as [string, number][]).forEach(([l, v]) => line(l, money(v)));
  y += 3; line("Month-over-month", "", true);
  ([["Net revenue", cur.netBilled, prev.netBilled], ["Expenses", cur.cogs + cur.opex, prev.cogs + prev.opex], ["Net profit", cur.netProfit, prev.netProfit]] as [string, number, number][]).forEach(([l, c, p]) => line(l, fmtPct(pctChange(c, p)).replace("▲", "+").replace("▼", "-")));
  y += 3; line("Revenue by department", "", true); dept.forEach(([d, v]) => line(d, money(v)));
  y += 3; line("Top tests", "", true); topTests(invoices, 5).forEach((t) => line(`${t.name} (${t.volume})`, money(t.revenue)));
  y += 3; line("Receivables", money(receivable), true); Object.entries(aging).forEach(([k, v]) => line(k, money(v)));
  doc.setFontSize(8); doc.text(`Generated ${new Date().toLocaleString()}`, 14, 288);
  doc.save(`executive-summary-${ym}.pdf`);
}

export function ExportButtons(p: { ym: string; cur: PL; prev: PL; dept: [string, number][]; invoices: Invoice[]; payments: Payment[]; expenses: Expense[]; receivable: number; aging: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => executivePdf(p.ym, p.cur, p.prev, p.dept, p.invoices, p.receivable, p.aging)}><FileText className="h-4 w-4 mr-1" />Executive PDF</Button>
      <Button variant="outline" onClick={() => accountantCsv(p.ym, p.invoices, p.payments, p.expenses)}><Download className="h-4 w-4 mr-1" />Accountant CSV (QuickBooks/Xero)</Button>
    </div>
  );
}

