import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { CompetenciaProvider } from '@/contexts/CompetenciaContext'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

// Páginas de Autenticação
import { LoginPage } from '@/pages/auth/LoginPage'
import { CadastroPage } from '@/pages/auth/CadastroPage'
import { EsqueciSenhaPage } from '@/pages/auth/EsqueciSenhaPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { ConfirmEmailChangePage } from '@/pages/auth/ConfirmEmailChangePage'
import { PrimeiroAcessoPage } from '@/pages/auth/PrimeiroAcessoPage'

// Páginas Protegidas
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LancamentosPage } from '@/pages/lancamentos/LancamentosPage'
import { ContasReceberPage } from '@/pages/contas/ContasReceberPage'
import { ContasPagarPage } from '@/pages/contas/ContasPagarPage'
import { RelatoriosPage } from '@/pages/relatorios/RelatoriosPage'
import { AuditoriaPage } from '@/pages/auditoria/AuditoriaPage'
import { ConfiguracoesPage } from '@/pages/configuracoes/ConfiguracoesPage'
import { UsuariosPage } from '@/pages/usuarios/UsuariosPage'
import { FechamentoCaixaPage } from '@/pages/fechamento/FechamentoCaixaPage'
import { OrcamentoPage } from '@/pages/orcamento/OrcamentoPage'
import { ReceitaPage } from '@/pages/receita/ReceitaPage'
import { CustosPage } from '@/pages/custos/CustosPage'
import { InadimplenciaPage } from '@/pages/inadimplencia/InadimplenciaPage'
import { IndicadoresPage } from '@/pages/indicadores/IndicadoresPage'
import { PlanoCategoriasPage } from '@/pages/plano/PlanoCategoriasPage'
import { DepreciacaoPage } from '@/pages/depreciacao/DepreciacaoPage'
import { RecorrenciasPage } from '@/pages/recorrencias/RecorrenciasPage'
import NotFound from '@/pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <CompetenciaProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rotas Públicas de Acesso */}
            <Route path="/" element={<LoginPage />} />
            <Route path="/cadastro" element={<CadastroPage />} />
            <Route path="/primeiro-acesso" element={<PrimeiroAcessoPage />} />
            <Route path="/esqueci-senha" element={<EsqueciSenhaPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />

            {/* Rotas Privadas Envolvidas por AppLayout e Verificação de Sessão */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/lancamentos" element={<LancamentosPage />} />
              <Route path="/contas-a-receber" element={<ContasReceberPage />} />
              <Route path="/contas-a-pagar" element={<ContasPagarPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/auditoria" element={<AuditoriaPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/fechamento-caixa" element={<FechamentoCaixaPage />} />
              <Route path="/orcamento" element={<OrcamentoPage />} />
              <Route path="/receita" element={<ReceitaPage />} />
              <Route path="/custos" element={<CustosPage />} />
              <Route path="/inadimplencia" element={<InadimplenciaPage />} />
              <Route path="/indicadores" element={<IndicadoresPage />} />
              <Route path="/plano-categorias" element={<PlanoCategoriasPage />} />
              <Route path="/depreciacao" element={<DepreciacaoPage />} />
              <Route path="/recorrencias" element={<RecorrenciasPage />} />
            </Route>

            {/* 404 Not Found */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </CompetenciaProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
