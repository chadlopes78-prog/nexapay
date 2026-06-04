import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/pixel" as any)({
  component: PixelPage,
});

function PixelPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pixel Facebook / Google</h1>
        <p className="text-muted-foreground">Configure o rastreio de conversões para suas campanhas.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Facebook Pixel</CardTitle>
            <CardDescription>Insira o ID do seu Pixel do Facebook para rastrear eventos de checkout.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fb-pixel">Pixel ID</Label>
              <Input id="fb-pixel" placeholder="Ex: 1234567890" />
            </div>
            <Button>Salvar Configurações</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Analytics / Ads</CardTitle>
            <CardDescription>Insira sua Tag de Rastreamento (G-XXXXX ou AW-XXXXX).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="google-tag">Tag ID</Label>
              <Input id="google-tag" placeholder="Ex: G-ABC123XYZ" />
            </div>
            <Button>Salvar Configurações</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
