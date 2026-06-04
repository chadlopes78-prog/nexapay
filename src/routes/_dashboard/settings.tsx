import { createFileRoute } from "@tanstack/react-router";
import { Settings, Shield, Globe, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_dashboard/settings" as any)({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências da plataforma.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle>Dados do Perfil</CardTitle>
            </div>
            <CardDescription>Atualize suas informações pessoais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Nome Completo</Label>
                <Input id="full-name" placeholder="Seu nome" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="seu@email.com" disabled />
              </div>
            </div>
            <Button>Salvar Alterações</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Segurança</CardTitle>
            </div>
            <CardDescription>Gerencie sua senha e autenticação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input id="new-password" type="password" />
            </div>
            <Button variant="outline">Alterar Senha</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
