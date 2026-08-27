import { Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTRPC } from "@/lib/trpc";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { RunsPage } from "@/pages/runs/RunsPage";
import { NewRunPage } from "@/pages/runs/NewRunPage";
import { RunDetailPage } from "@/pages/runs/RunDetailPage";
import { PostingsPage } from "@/pages/postings/PostingsPage";
import { CompaniesPage } from "@/pages/companies/CompaniesPage";
import { ExportPage } from "@/pages/export/ExportPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  const trpc = useTRPC();
  const [location] = useLocation();
  const { data: me, isLoading } = useQuery(trpc.auth.me.queryOptions());

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!me) return <LoginPage />;

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          <Switch>
            <Route path="/">
              <DashboardPage />
            </Route>
            <Route path="/runs/new">
              <NewRunPage />
            </Route>
            <Route path="/runs/:id">{(params) => <RunDetailPage id={params.id ?? ""} />}</Route>
            <Route path="/runs">
              <RunsPage />
            </Route>
            <Route path="/postings">
              <PostingsPage />
            </Route>
            <Route path="/companies">
              <CompaniesPage />
            </Route>
            <Route path="/export">
              <ExportPage />
            </Route>
            <Route path="/settings">
              <SettingsPage />
            </Route>
            <Route>
              <PlaceholderPage title="Not found" description="This page does not exist" />
            </Route>
          </Switch>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
