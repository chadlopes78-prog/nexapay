import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Info,
  Image as ImageIcon,
  DollarSign,
  ShoppingBag,
  CreditCard,
  Truck,
  Settings2,
  Phone,
  Facebook,
} from "lucide-react";

export interface ProductFormFieldsProps {
  idPrefix?: string;
  section?: "all" | "product" | "checkout";
  name: string;
  setName: (v: string) => void;
  description?: string;
  setDescription?: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  supportNumber: string;
  setSupportNumber: (v: string) => void;
  supportPhone: string;
  setSupportPhone: (v: string) => void;
  facebookPixelId: string;
  setFacebookPixelId: (v: string) => void;
  facebookAccessToken: string;
  setFacebookAccessToken: (v: string) => void;
  deliveryType: string;
  setDeliveryType: (v: string) => void;
  deliveryLink: string;
  setDeliveryLink: (v: string) => void;
  accessLink: string;
  setAccessLink: (v: string) => void;
  thankYouButtonText: string;
  setThankYouButtonText: (v: string) => void;
  deliveryFile?: File | null;
  setDeliveryFile?: (f: File | null) => void;
  imageFile: File | null;
  setImageFile: (f: File | null) => void;
  imageUrl: string;
  setImageUrl?: (v: string) => void;
  bannerFile: File | null;
  setBannerFile: (f: File | null) => void;
  bannerUrl: string;
  setBannerUrl?: (v: string) => void;
  showDeliveryFile?: boolean;
  country: string;
  setCountry: (v: string) => void;
}



function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      </header>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function ProductFormFields(props: ProductFormFieldsProps) {
  const p = props.idPrefix ?? "pf";
  const section = props.section ?? "all";
  const showProduct = section === "all" || section === "product";
  const showCheckout = section === "all" || section === "checkout";

  return (
    <div className="grid gap-4">
      {showProduct && (
        <Section icon={Info} title="Informações do produto" description="Nome, descrição e categoria">
          <div className="grid gap-2">
            <Label htmlFor={`${p}-name`}>Nome do produto</Label>
            <Input
              id={`${p}-name`}
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              placeholder="Ex: Curso de Marketing"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${p}-category`}>Categoria</Label>
              <Input
                id={`${p}-category`}
                value={props.category}
                onChange={(e) => props.setCategory(e.target.value)}
                placeholder="Educação"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${p}-support`}>WhatsApp de suporte</Label>
              <Input
                id={`${p}-support`}
                inputMode="tel"
                value={props.supportNumber}
                onChange={(e) => {
                  props.setSupportNumber(e.target.value);
                  props.setSupportPhone(e.target.value);
                }}
                placeholder="Ex: 25884xxxxxxx"
                required
              />
            </div>
          </div>
        </Section>
      )}

      {showProduct && (
        <Section icon={ImageIcon} title="Imagens" description="Foto do produto e banner do checkout">
          <div className="grid gap-2">
            <Label htmlFor={`${p}-image`}>Imagem principal do produto</Label>
            <Input
              id={`${p}-image`}
              type="file"
              accept="image/*"
              onChange={(e) => props.setImageFile(e.target.files?.[0] || null)}
            />
            {(props.imageFile || props.imageUrl) && (
              <div className="relative mt-1 inline-block">
                <img
                  src={props.imageFile ? URL.createObjectURL(props.imageFile) : props.imageUrl}
                  alt="Preview"
                  className="h-24 w-24 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.setImageFile(null);
                    props.setImageUrl?.("");
                    const el = document.getElementById(`${p}-image`) as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                  className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white text-xs shadow hover:bg-red-700"
                  aria-label="Remover imagem"
                >
                  ×
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${p}-banner-product`}>Banner do checkout</Label>
            <Input
              id={`${p}-banner-product`}
              type="file"
              accept="image/*"
              onChange={(e) => props.setBannerFile(e.target.files?.[0] || null)}
            />
            <p className="text-[11px] text-slate-500">Aparece no topo da página de checkout. Recomendado: 1200x300px.</p>
            {(props.bannerFile || props.bannerUrl) && (
              <div className="relative mt-1">
                <img
                  src={props.bannerFile ? URL.createObjectURL(props.bannerFile) : props.bannerUrl}
                  alt="Banner"
                  className="w-full max-h-40 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.setBannerFile(null);
                    props.setBannerUrl?.("");
                    const el = document.getElementById(`${p}-banner-product`) as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-red-600 text-white text-sm shadow hover:bg-red-700"
                  aria-label="Remover banner"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      {showProduct && (
        <Section icon={DollarSign} title="Mercado e Preço" description="Defina o país e o preço do produto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${p}-country`}>País do checkout</Label>
              <select
                id={`${p}-country`}
                value={props.country}
                onChange={(e) => props.setCountry(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="MZ">Moçambique 🇲🇿</option>
                <option value="ZA">África do Sul 🇿🇦</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${p}-price`}>Preço ({props.country === "ZA" ? "ZAR" : "MT"})</Label>
              <Input
                id={`${p}-price`}
                type="number"
                value={props.price}
                onChange={(e) => props.setPrice(e.target.value)}
                placeholder="1000"
                required
              />
            </div>
          </div>
        </Section>
      )}


      {showProduct && (
        <Section icon={Facebook} title="Rastreamento (Meta Pixel)" description="Opcional — para campanhas do Facebook/Instagram">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor={`${p}-pixel`}>Facebook Pixel ID</Label>
              <Input
                id={`${p}-pixel`}
                value={props.facebookPixelId}
                onChange={(e) => props.setFacebookPixelId(e.target.value)}
                placeholder="Ex: 123456789"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${p}-token`}>Facebook Access Token</Label>
              <Input
                id={`${p}-token`}
                value={props.facebookAccessToken}
                onChange={(e) => props.setFacebookAccessToken(e.target.value)}
                placeholder="EAAB..."
              />
            </div>
          </div>
        </Section>
      )}

      {showCheckout && (
        <Section icon={ImageIcon} title="Banner do checkout" description="Aparece no topo da página de checkout">
          <div className="grid gap-2">
            <Label htmlFor={`${p}-banner`}>Banner</Label>
            <Input
              id={`${p}-banner`}
              type="file"
              accept="image/*"
              onChange={(e) => props.setBannerFile(e.target.files?.[0] || null)}
            />
            {(props.bannerFile || props.bannerUrl) && (
              <div className="relative mt-1">
                <img
                  src={props.bannerFile ? URL.createObjectURL(props.bannerFile) : props.bannerUrl}
                  alt="Banner"
                  className="w-full rounded-lg border object-cover max-h-40"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.setBannerFile(null);
                    props.setBannerUrl?.("");
                    const el = document.getElementById(`${p}-banner`) as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-red-600 text-white text-sm shadow hover:bg-red-700"
                  aria-label="Remover banner"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      {showCheckout && (
        <Section icon={CreditCard} title="Métodos de pagamento" description="Disponíveis para este produto">
          <div className="flex flex-wrap gap-2">
            {props.country === "ZA" ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                  <CreditCard className="h-3.5 w-3.5" /> Visa / Mastercard
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  <Settings2 className="h-3.5 w-3.5" /> EFT / Instant Bank
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <Phone className="h-3.5 w-3.5" /> M-Pesa
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  <Phone className="h-3.5 w-3.5" /> e-Mola
                </div>
              </>
            )}
          </div>

        </Section>
      )}

      {showCheckout && (
        <Section icon={Truck} title="Entrega e acesso" description="Como o cliente recebe o produto após pagar">
          <div className="grid gap-2">
            <Label htmlFor={`${p}-access`}>Link de acesso principal</Label>
            <Input
              id={`${p}-access`}
              value={props.accessLink}
              onChange={(e) => props.setAccessLink(e.target.value)}
              placeholder="Link do produto, grupo ou arquivo"
              required
            />
            <p className="text-[11px] text-slate-500">Usado no botão da página de obrigado.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${p}-thanks`}>Texto do botão de acesso</Label>
            <Input
              id={`${p}-thanks`}
              value={props.thankYouButtonText}
              onChange={(e) => props.setThankYouButtonText(e.target.value)}
              placeholder="Liberar acesso"
              maxLength={40}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${p}-dtype`}>Entrega adicional</Label>
            <select
              id={`${p}-dtype`}
              value={props.deliveryType}
              onChange={(e) => props.setDeliveryType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="none">Nenhum adicional</option>
              <option value="file">Upload de arquivo</option>
              <option value="link">Link secundário</option>
              <option value="both">Ambos</option>
            </select>
          </div>
          {props.showDeliveryFile !== false && (props.deliveryType === "file" || props.deliveryType === "both") && (
            <div className="grid gap-2">
              <Label htmlFor={`${p}-dfile`}>Arquivo adicional</Label>
              <Input
                id={`${p}-dfile`}
                type="file"
                onChange={(e) => props.setDeliveryFile?.(e.target.files?.[0] || null)}
              />
            </div>
          )}
          {(props.deliveryType === "link" || props.deliveryType === "both") && (
            <div className="grid gap-2">
              <Label htmlFor={`${p}-dlink`}>Link adicional</Label>
              <Input
                id={`${p}-dlink`}
                value={props.deliveryLink}
                onChange={(e) => props.setDeliveryLink(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}
        </Section>
      )}

      {section === "all" && (
        <Section icon={ShoppingBag} title="Resumo" description="Prévia do que será publicado">
          <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white border">
              {(props.imageFile || props.imageUrl) ? (
                <img
                  src={props.imageFile ? URL.createObjectURL(props.imageFile) : props.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-slate-300">
                  <Settings2 className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {props.name || "Nome do produto"}
              </p>
              <p className="text-xs text-slate-500">
                {props.category || "Sem categoria"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-slate-900">
                {props.price ? `${Number(props.price).toLocaleString("pt-MZ")} ${props.country === "ZA" ? "R" : "MT"}` : "—"}
              </p>
              <p className="text-[11px] text-emerald-600 font-medium">Ativo</p>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

