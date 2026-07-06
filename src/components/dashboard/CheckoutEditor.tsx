import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Clock, Users, ShoppingCart, TrendingUp, Palette, Save, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckoutData {
  id?: string;
  title?: string;
  subtitle?: string;
  button_text?: string;
  guarantee_text?: string;
  primary_color?: string;
  timer_enabled?: boolean;
  timer_minutes?: number;
  timer_color?: string;
  timer_message?: string;
  social_proof_enabled?: boolean;
  social_proof_count?: number;
  social_proof_message?: string;
  order_bump_enabled?: boolean;
  order_bump_title?: string;
  order_bump_description?: string;
  order_bump_price?: number | null;
  order_bump_image_url?: string;
  upsell_enabled?: boolean;
  upsell_title?: string;
  upsell_description?: string;
  upsell_discount_percent?: number | null;
}

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#0f172a"];

interface SectionProps {
  icon: any;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  accent?: string;
  children?: React.ReactNode;
}

function Section({ icon: Icon, title, description, enabled, onToggle, accent = "bg-primary/10 text-primary", children }: SectionProps) {
  return (
    <div className={cn("rounded-xl border bg-white overflow-hidden transition-all", enabled ? "border-slate-300 shadow-sm" : "border-slate-200")}>
      <div className="flex items-start gap-3 p-4">
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", accent)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
            <Switch checked={enabled} onCheckedChange={onToggle} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {enabled && children && (
        <div className="border-t bg-slate-50/50 p-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function CheckoutEditor({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<CheckoutData>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: row } = await supabase.from("checkouts").select("*").eq("product_id", productId).maybeSingle();
      setData((row as CheckoutData) ?? {});
      setLoading(false);
    })();
  }, [productId]);

  const update = (patch: Partial<CheckoutData>) => setData((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...data, product_id: productId } as any;
      delete payload.id;
      const { error } = await supabase.from("checkouts").upsert(payload, { onConflict: "product_id" });
      if (error) throw error;
      toast.success("Checkout salvo!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Carregando…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Aparência */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white">
            <Palette className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Aparência do checkout</h4>
            <p className="text-xs text-slate-500">Textos e cor principal</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Título</Label>
            <Input value={data.title ?? ""} onChange={(e) => update({ title: e.target.value })} placeholder="Ex: Finalize sua compra" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Subtítulo</Label>
            <Input value={data.subtitle ?? ""} onChange={(e) => update({ subtitle: e.target.value })} placeholder="Ex: Acesso imediato após pagamento" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Texto do botão</Label>
            <Input value={data.button_text ?? ""} onChange={(e) => update({ button_text: e.target.value })} placeholder="Comprar agora" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Garantia</Label>
            <Input value={data.guarantee_text ?? ""} onChange={(e) => update({ guarantee_text: e.target.value })} placeholder="7 dias de garantia" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Cor principal</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update({ primary_color: c })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform",
                  data.primary_color === c ? "border-slate-900 scale-110" : "border-white ring-1 ring-slate-200"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <Input
              type="color"
              value={data.primary_color ?? "#3b82f6"}
              onChange={(e) => update({ primary_color: e.target.value })}
              className="h-8 w-14 p-1 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Cronômetro */}
      <Section
        icon={Clock}
        title="Cronômetro de urgência"
        description="Cria escassez com contagem regressiva no topo do checkout"
        enabled={!!data.timer_enabled}
        onToggle={(v) => update({ timer_enabled: v })}
        accent="bg-red-100 text-red-600"
      >
        <div className="grid gap-1.5">
          <Label className="text-xs">Mensagem</Label>
          <Input
            value={data.timer_message ?? ""}
            onChange={(e) => update({ timer_message: e.target.value })}
            placeholder="Oferta expira em"
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tempo (minutos)</Label>
            <span className="text-xs font-semibold text-slate-900">{data.timer_minutes ?? 15} min</span>
          </div>
          <Slider
            value={[data.timer_minutes ?? 15]}
            onValueChange={([v]) => update({ timer_minutes: v })}
            min={1}
            max={120}
            step={1}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Cor do cronômetro</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update({ timer_color: c })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform",
                  data.timer_color === c ? "border-slate-900 scale-110" : "border-white ring-1 ring-slate-200"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <Input
              type="color"
              value={data.timer_color ?? "#ef4444"}
              onChange={(e) => update({ timer_color: e.target.value })}
              className="h-8 w-14 p-1 cursor-pointer"
            />
          </div>
          {/* Preview */}
          <div
            className="mt-2 rounded-lg px-3 py-2 text-center text-white text-sm font-semibold"
            style={{ backgroundColor: data.timer_color ?? "#ef4444" }}
          >
            {data.timer_message || "Oferta expira em"}: {String(data.timer_minutes ?? 15).padStart(2, "0")}:00
          </div>
        </div>
      </Section>

      {/* Prova social */}
      <Section
        icon={Users}
        title="Prova social"
        description="Mostrar quantas pessoas já compraram"
        enabled={!!data.social_proof_enabled}
        onToggle={(v) => update({ social_proof_enabled: v })}
        accent="bg-emerald-100 text-emerald-600"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Número de compradores</Label>
            <Input
              type="number"
              min={1}
              value={data.social_proof_count ?? 127}
              onChange={(e) => update({ social_proof_count: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Mensagem</Label>
            <Input
              value={data.social_proof_message ?? ""}
              onChange={(e) => update({ social_proof_message: e.target.value })}
              placeholder="pessoas já compraram este produto"
            />
          </div>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span><b>{data.social_proof_count ?? 127}</b> {data.social_proof_message || "pessoas já compraram este produto"}</span>
        </div>
      </Section>

      {/* Order Bump */}
      <Section
        icon={ShoppingCart}
        title="Order Bump"
        description="Oferta adicional exibida antes de finalizar a compra"
        enabled={!!data.order_bump_enabled}
        onToggle={(v) => update({ order_bump_enabled: v })}
        accent="bg-amber-100 text-amber-600"
      >
        <div className="grid gap-1.5">
          <Label className="text-xs">Título da oferta</Label>
          <Input value={data.order_bump_title ?? ""} onChange={(e) => update({ order_bump_title: e.target.value })} placeholder="Ex: Adicione o Bônus VIP" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Descrição</Label>
          <Textarea rows={2} value={data.order_bump_description ?? ""} onChange={(e) => update({ order_bump_description: e.target.value })} placeholder="Ganhe acesso ao módulo avançado por um preço especial" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Preço (MT)</Label>
            <Input
              type="number"
              value={data.order_bump_price ?? ""}
              onChange={(e) => update({ order_bump_price: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="500"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3 w-3" /> URL da imagem</Label>
            <Input value={data.order_bump_image_url ?? ""} onChange={(e) => update({ order_bump_image_url: e.target.value })} placeholder="https://..." />
          </div>
        </div>
      </Section>

      {/* Upsell */}
      <Section
        icon={TrendingUp}
        title="Upsell"
        description="Sugerir produto adicional após a compra"
        enabled={!!data.upsell_enabled}
        onToggle={(v) => update({ upsell_enabled: v })}
        accent="bg-violet-100 text-violet-600"
      >
        <div className="grid gap-1.5">
          <Label className="text-xs">Título</Label>
          <Input value={data.upsell_title ?? ""} onChange={(e) => update({ upsell_title: e.target.value })} placeholder="Ex: Leve também o Curso Avançado" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Descrição</Label>
          <Textarea rows={2} value={data.upsell_description ?? ""} onChange={(e) => update({ upsell_description: e.target.value })} placeholder="Complementa perfeitamente sua compra" />
        </div>
        <div className="grid gap-1.5 max-w-[200px]">
          <Label className="text-xs">Desconto (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={data.upsell_discount_percent ?? ""}
            onChange={(e) => update({ upsell_discount_percent: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="20"
          />
        </div>
      </Section>

      {/* Save */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-white border-t px-4 sm:px-6 py-3 flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar checkout"}
        </Button>
      </div>
    </div>
  );
}
