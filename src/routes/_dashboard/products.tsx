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

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const validSupportPhone = getValidSupportPhone();
      if (!validSupportPhone) return;

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
          <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0 bg-slate-50">
            <form onSubmit={handleCreateProduct}>
              <DialogHeader className="px-6 py-5 border-b bg-white sticky top-0 z-10">
                <DialogTitle className="text-lg font-semibold">Novo produto</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Preencha as seções abaixo para publicar seu produto.
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 sm:p-6">
                <ProductFormFields
                  idPrefix="new"
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
                  deliveryFile={deliveryFile} setDeliveryFile={setDeliveryFile}
                  imageFile={imageFile} setImageFile={setImageFile}
                  imageUrl={imageUrl}
                  bannerFile={bannerFile} setBannerFile={setBannerFile}
                  bannerUrl={bannerUrl}
                />
              </div>
              <DialogFooter className="px-6 py-4 border-t bg-white sticky bottom-0 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Publicar produto</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>


        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0 bg-slate-50">
            <form onSubmit={handleUpdateProduct}>
              <DialogHeader className="px-6 py-5 border-b bg-white sticky top-0 z-10">
                <DialogTitle className="text-lg font-semibold">Editar produto</DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Atualize as informações do seu produto.
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 sm:p-6">
                <ProductFormFields
                  idPrefix="edit"
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
                  imageUrl={imageUrl}
                  bannerFile={bannerFile} setBannerFile={setBannerFile}
                  bannerUrl={bannerUrl}
                  showDeliveryFile={false}
                />
              </div>
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
          <Input placeholder="Buscar produtos..." className="pl-9" />
        </div>
      </div>

      <div className="rounded-md border bg-white overflow-x-auto overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Vendas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Carregando produtos...
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="truncate max-w-[120px] sm:max-w-none">{product.name}</span>
                      <span className="text-xs text-muted-foreground block sm:hidden">
                        {product.price.toLocaleString("pt-MZ")} MT
                      </span>
                      <span className="text-xs text-muted-foreground">{product.category}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{product.price.toLocaleString("pt-MZ")} MT</TableCell>
                  <TableCell>
                    <Badge
                      variant={product.status === "active" ? "secondary" : "outline"}
                      className={cn(
                        "text-[10px] sm:text-xs",
                        product.status === "active"
                          ? "bg-green-100 text-green-700 hover:bg-green-100"
                          : ""
                      )}
                    >
                      {product.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">0</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="hidden lg:flex items-center gap-2 h-8 px-3 text-xs"
                        onClick={() => copyCheckoutLink(product.id)}
                      >
                        <Copy className="h-3 w-3" /> Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden h-8 w-8"
                        onClick={() => copyCheckoutLink(product.id)}
                        title="Copiar Link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => window.open(`/p/${product.id}`, "_blank")}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" /> Ver Checkout
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <QrCode className="mr-2 h-4 w-4" /> QR Code
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
