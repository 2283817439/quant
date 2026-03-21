import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Backtest from "./pages/Backtest";
import Positions from "./pages/Positions";
import RiskDashboard from "./pages/RiskDashboard";
import Strategy from "./pages/Strategy";
import History from "./pages/History";
import DataManagement from "./pages/DataManagement";
import Benchmark from "./pages/Benchmark";
import Optimization from "./pages/Optimization";
import Portfolio from "./pages/Portfolio";
import Trading from "./pages/Trading";
import ExecutionMonitor from "./pages/ExecutionMonitor";
import ParameterScan from "./pages/ParameterScan";
import Settings from "./pages/Settings";
import HelpCenter from "./pages/HelpCenter";
import BacktestComparison from "./pages/BacktestComparison";
import Rankings from "./pages/Rankings";
import Approvals from "./pages/Approvals";
import AgentManagement from "./pages/AgentManagement";
import TaskManagement from "./pages/TaskManagement";
import CostTracking from "./pages/CostTracking";
import Goals from "./pages/Goals";
import AuditLog from "./pages/AuditLog";
import AgentDetail from "./pages/AgentDetail";
import TaskDetail from "./pages/TaskDetail";
import Projects from "./pages/Projects";
import Inbox from "./pages/Inbox";
import MyIssues from "./pages/MyIssues";
import GoalDetail from "./pages/GoalDetail";
import ProjectDetail from "./pages/ProjectDetail";
import OrgChart from "./pages/OrgChart";
import NewsInsight from "./pages/NewsInsight";
import AIStockPicker from "./pages/AIStockPicker";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/backtest" component={Backtest} />
        <Route path="/backtest-comparison" component={BacktestComparison} />
        <Route path="/positions" component={Positions} />
        <Route path="/risk" component={RiskDashboard} />
        <Route path="/strategy" component={Strategy} />
        <Route path="/trading" component={Trading} />
        <Route path="/execution-monitor" component={ExecutionMonitor} />
        <Route path="/history" component={History} />
        <Route path="/data-management" component={DataManagement} />
        <Route path="/benchmark" component={Benchmark} />
        <Route path="/optimization" component={Optimization} />
        <Route path="/parameter-scan" component={ParameterScan} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/rankings" component={Rankings} />
        <Route path="/agents" component={AgentManagement} />
        <Route path="/agents/:id" component={AgentDetail} />
        <Route path="/tasks" component={TaskManagement} />
        <Route path="/tasks/:id" component={TaskDetail} />
        <Route path="/goals" component={Goals} />
        <Route path="/goals/:id" component={GoalDetail} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/costs" component={CostTracking} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/org-chart" component={OrgChart} />
        <Route path="/news-insight" component={NewsInsight} />
        <Route path="/ai-stock-picker" component={AIStockPicker} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/my-issues" component={MyIssues} />
        <Route path="/settings" component={Settings} />
        <Route path="/help" component={HelpCenter} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: 'oklch(0.175 0.012 264)',
                border: '1px solid oklch(1 0 0 / 0.1)',
                color: 'oklch(0.92 0.005 220)',
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
