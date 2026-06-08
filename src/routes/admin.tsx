import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  UserCheck, 
  UserPlus, 
  UserX, 
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Ban,
  Shield,
  LayoutDashboard
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    banned: 0
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const PAGE_SIZE = 20;

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const checkAdmin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (session.user.email !== 'chadlopesff@gmail.com' && profile?.role !== 'admin') {
      navigate({ to: "/dashboard" });
      toast.error("Acesso negado.");
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch stats (simplified aggregation)
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("status");
      
      if (allProfiles) {
        setStats({
          total: allProfiles.length,
          pending: allProfiles.filter(u => u.status === 'pending').length,
          approved: allProfiles.filter(u => u.status === 'approved').length,
          banned: allProfiles.filter(u => u.status === 'banned').length
        });
      }

      // Fetch paginated users
      let query = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.ilike("full_name", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar usuários: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (userId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status })
        .eq("id", userId);
      
      if (error) throw error;
      
      toast.success(`Usuário ${status} com sucesso.`);
      fetchUsers();
    } catch (error: any) {
      toast.error("Erro ao atualizar status: " + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">Aprovado</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Pendente</Badge>;
      case 'banned': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Banido</Badge>;
      case 'rejected': return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200">Rejeitado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Panel
          </h1>
          <p className="text-sm text-slate-500">Gerenciamento de usuários e aprovações.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard">
            <Button variant="outline" size="sm" className="bg-white">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Voltar ao Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Usuários", value: stats.total, icon: Users, color: "text-blue-600" },
          { label: "Pendentes", value: stats.pending, icon: UserPlus, color: "text-amber-600" },
          { label: "Aprovados", value: stats.approved, icon: UserCheck, color: "text-emerald-600" },
          { label: "Banidos", value: stats.banned, icon: UserX, color: "text-red-600" },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                </div>
                <div className={`${stat.color} bg-slate-50 p-3 rounded-2xl`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="p-6 pb-0 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-bold">Usuários Recentes</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nome..." 
              className="pl-9 h-9 border-slate-200 focus-visible:ring-primary/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-bold text-slate-700">Usuário</TableHead>
                  <TableHead className="font-bold text-slate-700">Cargo</TableHead>
                  <TableHead className="font-bold text-slate-700">Status</TableHead>
                  <TableHead className="font-bold text-slate-700">Criado em</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell colSpan={5} className="h-16 bg-slate-50/20"></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-slate-50/50 border-slate-100">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{user.full_name || "Sem nome"}</span>
                          <span className="text-xs text-slate-500 font-mono truncate max-w-[150px]">{user.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize font-medium border-slate-200">
                          {user.role || "user"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 p-2">
                            <DropdownMenuLabel>Ações de Acesso</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="flex items-center gap-2 text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50 cursor-pointer"
                              onClick={() => handleUpdateStatus(user.id, 'approved')}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Aprovar Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="flex items-center gap-2 text-amber-600 focus:text-amber-700 focus:bg-amber-50 cursor-pointer"
                              onClick={() => handleUpdateStatus(user.id, 'rejected')}
                            >
                              <XCircle className="h-4 w-4" />
                              Rejeitar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="flex items-center gap-2 text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
                              onClick={() => handleUpdateStatus(user.id, 'banned')}
                            >
                              <Ban className="h-4 w-4" />
                              Banir Usuário
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Mostrando {users.length} de {stats.total} usuários
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold">Página {page + 1}</span>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8"
                disabled={users.length < PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
