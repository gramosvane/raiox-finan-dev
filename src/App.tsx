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

// Páginas Protegidas
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { LancamentosPage } from '@/pages/lancamentos/LancamentosPage'
import { ContasReceberPage } from '@/pages/contas/ContasReceberPage'
import { ContasPagarPage } from '@/pages/contas/ContasPagarPage'
import { RelatoriosPage } from '@/pages/relatorios/RelatoriosPage'
import { AuditoriaPage } from '@/pages/auditoria/AuditoriaPage'
import { ConfiguracoesPage } from '@/pages/configuracoes/ConfiguracoesPage'
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
