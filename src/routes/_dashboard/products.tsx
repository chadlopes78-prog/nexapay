import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Package,
  Plus,
  Search,
  MoreHorizontal,
  ExternalLink,
  QrCode,
  Edit,
  Trash2,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ProductFormFields } from "@/components/dashboard/ProductFormFields";
import { NewProductWizard } from "@/components/dashboard/NewProductWizard";
import { CheckoutEditor } from "@/components/dashboard/CheckoutEditor";



export const Route = createFileRoute("/_dashboard/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportNumber, setSupportNumber] = useState("");
  const [facebookPixelId, setFacebookPixelId] = useState("");
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [deliveryType, setDeliveryType] = useState("none");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [accessLink, setAccessLink] = useState("");
  const [thankYouButtonText, setThankYouButtonText] = useState("Liberar acesso");
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string>("");

  const uploadProductImage = async (userId: string, file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    const { data: signed, error: signErr } = await supabase.storage
      .from("product-images")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);
    if (signErr) throw signErr;
    return signed.signedUrl;
  };

  const normalizeSupportPhone = (value: string) => {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("258")) return digits;
    if (digits.startsWith("0") && digits.length === 10) digits = digits.slice(1);
    if (digits.length === 9) return `258${digits}`;
    return digits;
  };

  const getValidSupportPhone = () => {
    const normalized = normalizeSupportPhone(supportPhone);
    if (!/^258\d{9}$/.test(normalized)) {
      toast.error("Informe um número de suporte válido. Ex: 84xxxxxxx ou +258 84xxxxxxx");
      return null;
    }
    return normalized;
  };

  const fetchProducts = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao buscar produtos");
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const validSupportPhone = getValidSupportPhone();
      if (!validSupportPhone) return;

      // Um produto ativo precisa ter pelo menos um link para o cliente aceder
      // ao que comprou. Sem access_link nem delivery_link o checkout aprova mas
      // o comprador cai numa página vazia.
      if (!accessLink.trim() && !deliveryLink.trim()) {
        toast.error("Configure o link de acesso ou o link de entrega antes de ativar o produto.");
        return;
      }

      let deliveryFileUrl = "";



      if (deliveryFile) {
        const fileExt = deliveryFile.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-deliverables")
          .upload(filePath, deliveryFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("product-deliverables")
          .getPublicUrl(filePath);
        
        deliveryFileUrl = publicUrl;
      }

      let uploadedImageUrl = "";
      if (imageFile) {
        uploadedImageUrl = await uploadProductImage(user.id, imageFile);
      }
      let uploadedBannerUrl = "";
      if (bannerFile) {
        uploadedBannerUrl = await uploadProductImage(user.id, bannerFile);
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          name,
          description,
          price: parseFloat(price),
          category,
          support_phone: validSupportPhone,
          support_number: supportNumber || validSupportPhone,
          user_id: user.id,
          status: "active",
          facebook_pixel_id: facebookPixelId,
          facebook_access_token: facebookAccessToken,
          delivery_type: deliveryType,
          delivery_link: deliveryLink,
          delivery_file_url: deliveryFileUrl,
          access_link: accessLink || deliveryLink,
          thank_you_button_text: thankYouButtonText || "Liberar acesso",
          image_url: uploadedImageUrl || null,
          checkout_banner_url: uploadedBannerUrl || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default checkout record for the product
      const { error: checkoutError } = await supabase.from("checkouts").insert({
        product_id: data.id,
        title: name,
        subtitle: description ? description.substring(0, 100) : "",
      });

      if (checkoutError) {
        console.error("Erro ao criar configurações de checkout:", checkoutError);
        // We don't throw here to avoid failing product creation if checkout fails
      }

      const checkoutLink = `${window.location.origin}/p/${data.id}`;
      toast.success("Produto criado com sucesso!", {
        description: "O link de checkout já está pronto para uso.",
        action: {
          label: "Copiar Link",
          onClick: () => {
            navigator.clipboard.writeText(checkoutLink);
            toast.success("Link copiado!");
          }
        }
      });
      setIsDialogOpen(false);
      resetForm();
      fetchProducts();

    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCategory("");
    setSupportPhone("");
    setFacebookPixelId("");
    setFacebookAccessToken("");
    setDeliveryType("none");
    setDeliveryLink("");
    setAccessLink("");
    setThankYouButtonText("Liberar acesso");
    setDeliveryFile(null);
    setImageFile(null);
    setImageUrl("");
    setBannerFile(null);
    setBannerUrl("");
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || "");
    setPrice(product.price.toString());
    setCategory(product.category || "");
    setSupportPhone(product.support_phone || "");
    setSupportNumber(product.support_number || product.support_phone || "");
    setFacebookPixelId(product.facebook_pixel_id || "");
    setFacebookAccessToken(product.facebook_access_token || "");
    setDeliveryType(product.delivery_type || "none");
    setDeliveryLink(product.delivery_link || "");
    setAccessLink(product.access_link || "");
    setThankYouButtonText(product.thank_you_button_text || "Liberar acesso");
    setImageUrl(product.image_url || "");
    setImageFile(null);
    setBannerUrl(product.checkout_banner_url || "");
    setBannerFile(null);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      const validSupportPhone = getValidSupportPhone();
      if (!validSupportPhone) return;

      // Só bloqueia se o produto está (ou vai continuar) ativo. Produtos
      // antigos já ativos não são desativados automaticamente aqui — a
      // regra só vale quando o vendedor edita um produto ativo e apaga
      // ambos os links.
      if (editingProduct.status === "active" && !accessLink.trim() && !deliveryLink.trim()) {
        toast.error("Configure o link de acesso ou o link de entrega antes de ativar o produto.");
        return;
      }



      let finalImageUrl = imageUrl;
      if (imageFile) {
        finalImageUrl = await uploadProductImage(editingProduct.user_id, imageFile);
      }
      let finalBannerUrl = bannerUrl;
      if (bannerFile) {
        finalBannerUrl = await uploadProductImage(editingProduct.user_id, bannerFile);
      }

      const { error } = await supabase
        .from("products")
        .update({
          name,
          description,
          price: parseFloat(price),
          category,
          support_phone: validSupportPhone,
          support_number: supportNumber || validSupportPhone,
          facebook_pixel_id: facebookPixelId,
          facebook_access_token: facebookAccessToken,
          delivery_type: deliveryType,
          delivery_link: deliveryLink,
          access_link: accessLink || deliveryLink,
          thank_you_button_text: thankYouButtonText || "Liberar acesso",
          image_url: finalImageUrl || null,
          checkout_banner_url: finalBannerUrl || null,
        })
        .eq("id", editingProduct.id);

      if (error) throw error;

      toast.success("Produto atualizado com sucesso!");
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      toast.success("Produto excluído com sucesso!");
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleStatus = async (product: any) => {
    const nextStatus = product.status === "active" ? "inactive" : "active";
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: nextStatus })
        .eq("id", product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: nextStatus } : p)),
      );
      toast.success(nextStatus === "active" ? "Produto ativado!" : "Produto desativado!");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDuplicateProduct = async (product: any) => {

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { id, created_at, updated_at, ...rest } = product;
      const cleanName = String(product.name)
        .replace(/^\s*C[óo]pia de\s+/i, "")
        .replace(/\s*\(c[óo]pia\)\s*$/i, "")
        .trim();
      const { data, error } = await supabase
        .from("products")
        .insert({ ...rest, name: `Cópia de ${cleanName}`, user_id: user.id, status: "active" })
        .select()
        .single();
      if (error) throw error;

      // Duplicate checkout settings if any
      const { data: originalCheckout } = await supabase
        .from("checkouts")
        .select("*")
        .eq("product_id", product.id)
        .maybeSingle();
      if (originalCheckout) {
        const { id: _cid, created_at: _cc, updated_at: _cu, product_id: _pid, ...checkoutRest } = originalCheckout as any;
        await supabase.from("checkouts").insert({ ...checkoutRest, product_id: data.id });
      } else {
        await supabase.from("checkouts").insert({
          product_id: data.id,
          title: data.name,
          subtitle: data.description ? String(data.description).substring(0, 100) : "",
        });
      }

      toast.success("Produto duplicado!");
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };


  const copyCheckoutLink = (productId: string) => {
    const url = `${window.location.origin}/p/${productId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link de checkout copiado!");
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Produtos</h1>
          <p className="text-sm md:text-base text-muted-foreground">Gerencie seus produtos digitais e físicos.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0 bg-slate-50">
            <DialogHeader className="px-6 py-4 border-b bg-white">
              <DialogTitle className="text-lg font-semibold">Criar novo produto</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                Siga as etapas para publicar seu produto rapidamente.
              </DialogDescription>
            </DialogHeader>
            <NewProductWizard
              name={name} setName={setName}
              description={description} setDescription={setDescription}
              price={price} setPrice={setPrice}
              category={category} setCategory={setCategory}
              supportNumber={supportNumber} setSupportNumber={setSupportNumber}
              supportPhone={supportPhone} setSupportPhone={setSupportPhone}
              accessLink={accessLink} setAccessLink={setAccessLink}
              thankYouButtonText={thankYouButtonText} setThankYouButtonText={setThankYouButtonText}
              imageFile={imageFile} setImageFile={setImageFile}
              imageUrl={imageUrl} setImageUrl={setImageUrl}
              bannerFile={bannerFile} setBannerFile={setBannerFile}
              bannerUrl={bannerUrl} setBannerUrl={setBannerUrl}
              onCancel={() => setIsDialogOpen(false)}
              onSubmit={() => handleCreateProduct()}
            />
          </DialogContent>
        </Dialog>


        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0 bg-slate-50">
            <form onSubmit={handleUpdateProduct}>
              <DialogHeader className="px-6 py-5 border-b bg-white sticky top-0 z-20">
                <DialogTitle className="text-lg font-semibold">Editar produto</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  {editingProduct?.name || "Atualize as informações do seu produto."}
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="product" className="w-full">
                <div className="bg-white border-b sticky top-[85px] z-10">
                  <TabsList className="mx-4 sm:mx-6 my-2 grid w-fit grid-cols-2 bg-slate-100">
                    <TabsTrigger value="product" className="px-6">Produto</TabsTrigger>
                    <TabsTrigger value="checkout" className="px-6">Checkout</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="product" className="p-4 sm:p-6 mt-0 space-y-4">
                  <ProductFormFields
                    idPrefix="edit-p"
                    section="product"
                    name={name} setName={setName}
                    description={description} setDescription={setDescription}
                    price={price} setPrice={setPrice}
                    category={category} setCategory={setCategory}
                    supportNumber={supportNumber} setSupportNumber={setSupportNumber}
                    supportPhone={supportPhone} setSupportPhone={setSupportPhone}
                    facebookPixelId={facebookPixelId} setFacebookPixelId={setFacebookPixelId}
                    facebookAccessToken={facebookAccessToken} setFacebookAccessToken={setFacebookAccessToken}
                    deliveryType={deliveryType} setDeliveryType={setDeliveryType}
                    deliveryLink={deliveryLink} setDeliveryLink={setDeliveryLink}
                    accessLink={accessLink} setAccessLink={setAccessLink}
                    thankYouButtonText={thankYouButtonText} setThankYouButtonText={setThankYouButtonText}
                    imageFile={imageFile} setImageFile={setImageFile}
                    imageUrl={imageUrl} setImageUrl={setImageUrl}
                    bannerFile={bannerFile} setBannerFile={setBannerFile}
                    bannerUrl={bannerUrl} setBannerUrl={setBannerUrl}
                    showDeliveryFile={false}
                  />
                  <section className="rounded-xl border border-slate-200/70 bg-white p-4 sm:p-5 grid gap-4">
                    <h3 className="text-sm font-semibold text-slate-900">Acesso ao produto</h3>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-access">Link de acesso principal</Label>
                      <Input id="edit-access" value={accessLink} onChange={(e) => setAccessLink(e.target.value)} placeholder="Link do produto, grupo ou arquivo" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-thanks">Texto do botão de acesso</Label>
                      <Input id="edit-thanks" value={thankYouButtonText} onChange={(e) => setThankYouButtonText(e.target.value)} placeholder="Liberar acesso" maxLength={40} />
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="checkout" className="p-4 sm:p-6 mt-0">
                  {editingProduct?.id && <CheckoutEditor productId={editingProduct.id} />}
                </TabsContent>
              </Tabs>
              <DialogFooter className="px-6 py-4 border-t bg-white sticky bottom-0 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Salvar alterações</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar produtos..." className="pl-9 bg-white" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200/70 bg-white p-4 animate-pulse">
              <div className="h-32 w-full rounded-lg bg-slate-100 mb-4" />
              <div className="h-4 w-3/4 bg-slate-100 rounded mb-2" />
              <div className="h-3 w-1/2 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
            <Package className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Nenhum produto ainda</h3>
          <p className="text-sm text-slate-500 mt-1">Crie seu primeiro produto para começar a vender.</p>
          <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo Produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="group rounded-lg border border-slate-200/70 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all flex flex-col"
            >
              <div className="relative aspect-square bg-slate-100 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-slate-300">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <Badge
                  className={cn(
                    "absolute top-1.5 left-1.5 text-[9px] font-medium border-0 px-1.5 py-0 h-4",
                    product.status === "active"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {product.status === "active" ? "Ativo" : "Off"}
                </Badge>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="icon" className="h-6 w-6 shadow-sm">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => window.open(`/p/${product.id}`, "_blank")}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Ver checkout
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyCheckoutLink(product.id)}>
                        <Copy className="mr-2 h-4 w-4" /> Copiar link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateProduct(product)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="p-2.5 flex-1 flex flex-col">
                <h3 className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  {product.name}
                </h3>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {product.price.toLocaleString("pt-MZ")} <span className="text-[10px] font-medium text-slate-500">MT</span>
                </p>
                <div className="mt-2 flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-6 text-[10px] px-1.5"
                    onClick={() => handleEditProduct(product)}
                  >
                    <Edit className="h-2.5 w-2.5 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => copyCheckoutLink(product.id)}
                    title="Copiar link"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

