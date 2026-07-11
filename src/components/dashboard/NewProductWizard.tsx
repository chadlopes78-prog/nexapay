import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, BookOpen, Package as PackageIcon, Ticket, RefreshCw, Info, DollarSign, Truck, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ProductType = "digital" | "physical" | "event" | "subscription";

const TYPES: { id: ProductType; icon: any; title: string; desc: string }[] = [
  { id: "digital", icon: BookOpen, title: "Produto digital", desc: "Cursos, e-books, arquivos, mentorias" },
  { id: "physical", icon: PackageIcon, title: "Produto físico", desc: "Produtos com envio" },
  { id: "event", icon: Ticket, title: "Evento", desc: "Ingressos e inscrições" },
  { id: "subscription", icon: RefreshCw, title: "Assinatura", desc: "Cobrança recorrente" },
];

interface Props {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  price: string; setPrice: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  supportNumber: string; setSupportNumber: (v: string) => void;
  supportPhone: string; setSupportPhone: (v: string) => void;
  accessLink: string; setAccessLink: (v: string) => void;
  thankYouButtonText: string; setThankYouButtonText: (v: string) => void;
  imageFile: File | null; setImageFile: (f: File | null) => void;
  imageUrl: string; setImageUrl?: (v: string) => void;
  bannerFile: File | null; setBannerFile: (f: File | null) => void;
  bannerUrl: string; setBannerUrl?: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function NewProductWizard(props: Props) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<ProductType>("digital");
  const total = 4;

  const canNext =
    (step === 1 && !!type) ||
    (step === 2 && props.name.trim().length > 0 && Number(props.price) > 0) ||
    (step === 3 && props.supportNumber.trim().length > 0) ||
    step === 4;

  const next = () => setStep((s) => Math.min(total, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="flex flex-col">
      {/* Stepper */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: total }).map((_, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold border transition-colors",
                    done && "bg-emerald-500 text-white border-emerald-500",
                    active && "bg-primary text-primary-foreground border-primary",
                    !done && !active && "bg-white text-slate-400 border-slate-200"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </div>
                {n < total && (
                  <div className={cn("h-px flex-1", n < step ? "bg-emerald-500" : "bg-slate-200")} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-between text-[11px] font-medium text-slate-500">
          <span>Tipo</span>
          <span>Informações</span>
          <span>Entrega</span>
          <span>Revisão</span>
        </div>
      </div>

      <div className="p-6 min-h-[380px]">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Que tipo de produto você quer criar?</h3>
              <p className="text-sm text-slate-500">Escolha a opção que melhor descreve seu produto.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const selected = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={cn(
                      "text-left rounded-xl border-2 p-4 transition-all hover:border-primary/50",
                      selected ? "border-primary bg-primary/5" : "border-slate-200 bg-white"
                    )}
                  >
                    <div className={cn(
                      "mb-3 flex h-10 w-10 items-center justify-center rounded-lg",
                      selected ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="font-semibold text-sm text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Info className="h-4 w-4" /> Informações do produto
              </h3>
              <p className="text-sm text-slate-500">Como seu produto será apresentado ao cliente.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-name">Nome do produto *</Label>
              <Input id="wiz-name" value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="Ex: Curso Completo de Marketing" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-desc">Descrição</Label>
              <Textarea id="wiz-desc" value={props.description} onChange={(e) => props.setDescription(e.target.value)} placeholder="Descreva brevemente o que o cliente vai receber" rows={3} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wiz-price" className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Preço (MT) *</Label>
                <Input id="wiz-price" type="number" value={props.price} onChange={(e) => props.setPrice(e.target.value)} placeholder="1000" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wiz-cat">Categoria</Label>
                <Input id="wiz-cat" value={props.category} onChange={(e) => props.setCategory(e.target.value)} placeholder="Educação" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-img" className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Imagem do produto</Label>
              <Input id="wiz-img" type="file" accept="image/*" onChange={(e) => props.setImageFile(e.target.files?.[0] || null)} />
              {(props.imageFile || props.imageUrl) && (
                <img
                  src={props.imageFile ? URL.createObjectURL(props.imageFile) : props.imageUrl}
                  alt=""
                  className="mt-1 h-20 w-20 rounded-lg border object-cover"
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-banner" className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Banner do checkout</Label>
              <Input id="wiz-banner" type="file" accept="image/*" onChange={(e) => props.setBannerFile(e.target.files?.[0] || null)} />
              <p className="text-[11px] text-slate-500">Aparece no topo da página de checkout. Recomendado: 1200x300px.</p>
              {(props.bannerFile || props.bannerUrl) && (
                <img
                  src={props.bannerFile ? URL.createObjectURL(props.bannerFile) : props.bannerUrl}
                  alt=""
                  className="mt-1 w-full max-h-32 rounded-lg border object-cover"
                />
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Truck className="h-4 w-4" /> Entrega e suporte
              </h3>
              <p className="text-sm text-slate-500">Como o cliente recebe o produto e fala com você.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-access">Link de acesso ao produto *</Label>
              <Input id="wiz-access" value={props.accessLink} onChange={(e) => props.setAccessLink(e.target.value)} placeholder="https://... (grupo, área de membros, arquivo)" />
              <p className="text-[11px] text-slate-500">Enviado ao cliente na página de obrigado após o pagamento.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-btn">Texto do botão de acesso</Label>
              <Input id="wiz-btn" value={props.thankYouButtonText} onChange={(e) => props.setThankYouButtonText(e.target.value)} placeholder="Liberar acesso" maxLength={40} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wiz-sup">WhatsApp de suporte *</Label>
              <Input
                id="wiz-sup"
                inputMode="tel"
                value={props.supportNumber}
                onChange={(e) => {
                  props.setSupportNumber(e.target.value);
                  props.setSupportPhone(e.target.value);
                }}
                placeholder="Ex: 25884xxxxxxx"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Revise e publique</h3>
              <p className="text-sm text-slate-500">Confira as informações antes de publicar.</p>
            </div>
            <div className="rounded-xl border bg-white p-4 flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-slate-50">
                {(props.imageFile || props.imageUrl) ? (
                  <img src={props.imageFile ? URL.createObjectURL(props.imageFile) : props.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-300"><PackageIcon className="h-6 w-6" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{props.name || "—"}</p>
                <p className="text-xs text-slate-500 truncate">{props.category || "Sem categoria"} · {TYPES.find(t => t.id === type)?.title}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">{props.price ? `${Number(props.price).toLocaleString("pt-MZ")} MT` : "—"}</p>
              </div>
            </div>
            <dl className="rounded-xl border bg-white divide-y text-sm">
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Suporte</dt><dd className="font-medium text-slate-900">{props.supportNumber || "—"}</dd></div>
              <div className="flex justify-between px-4 py-2.5 gap-4"><dt className="text-slate-500">Acesso</dt><dd className="font-medium text-slate-900 truncate max-w-[60%]">{props.accessLink || "—"}</dd></div>
              <div className="flex justify-between px-4 py-2.5"><dt className="text-slate-500">Botão</dt><dd className="font-medium text-slate-900">{props.thankYouButtonText || "Liberar acesso"}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-white px-6 py-4 sticky bottom-0">
        <Button type="button" variant="ghost" onClick={step === 1 ? props.onCancel : prev}>
          {step === 1 ? "Cancelar" : (<><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</>)}
        </Button>
        <span className="text-xs text-slate-500">Etapa {step} de {total}</span>
        {step < total ? (
          <Button type="button" onClick={next} disabled={!canNext}>
            Continuar <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={props.onSubmit} disabled={props.submitting}>
            {props.submitting ? "Publicando..." : "Publicar produto"}
          </Button>
        )}
      </div>
    </div>
  );
}
