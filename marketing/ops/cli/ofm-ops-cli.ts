#!/usr/bin/env ts-node

/**
 * OFM Social OS Operations CLI
 * 
 * Comprehensive command-line interface for production operations,
 * deployment management, and system administration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// CLI Configuration
interface CLIConfig {
  environment: string;
  namespace: string;
  apiUrl: string;
  prometheusUrl: string;
  grafanaUrl: string;
  argoRolloutsUrl: string;
}

const DEFAULT_CONFIG: CLIConfig = {
  environment: 'production',
  namespace: 'ofm-production',
  apiUrl: 'https://api.ofm.social',
  prometheusUrl: 'https://prometheus.ofm.social',
  grafanaUrl: 'https://grafana.ofm.social',
  argoRolloutsUrl: 'http://localhost:3100',
};

// Load configuration
const loadConfig = (): CLIConfig => {
  const configPath = path.join(process.env.HOME || '', '.ofm-cli-config.json');
  
  if (fs.existsSync(configPath)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Invalid config file, using defaults'));
    }
  }
  
  return DEFAULT_CONFIG;
};

const config = loadConfig();

// Utility functions
const log = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warning: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.log(chalk.red('✗'), msg),
  header: (msg: string) => console.log(chalk.bold.cyan(msg)),
};

const spinner = (text: string) => ora({
  text,
  color: 'cyan',
  spinner: 'dots',
});

// Health Check Command
const healthCheck = async () => {
  const spin = spinner('Checking system health...').start();
  
  try {
    const health = {
      api: false,
      prometheus: false,
      grafana: false,
      kubernetes: false,
    };

    // Check API
    try {
      await axios.get(`${config.apiUrl}/health`, { timeout: 5000 });
      health.api = true;
    } catch {}

    // Check Prometheus
    try {
      await axios.get(`${config.prometheusUrl}/api/v1/query?query=up`, { timeout: 5000 });
      health.prometheus = true;
    } catch {}

    // Check Grafana
    try {
      await axios.get(`${config.grafanaUrl}/api/health`, { timeout: 5000 });
      health.grafana = true;
    } catch {}

    // Check Kubernetes
    try {
      await execAsync('kubectl cluster-info');
      health.kubernetes = true;
    } catch {}

    spin.stop();
    
    log.header('\n🏥 System Health Status');
    console.log('━'.repeat(50));
    
    Object.entries(health).forEach(([service, status]) => {
      const icon = status ? chalk.green('✓') : chalk.red('✗');
      const statusText = status ? chalk.green('HEALTHY') : chalk.red('DOWN');
      console.log(`${icon} ${service.padEnd(15)} ${statusText}`);
    });

    const overall = Object.values(health).every(Boolean);
    console.log('━'.repeat(50));
    console.log(`${overall ? chalk.green('✓') : chalk.red('✗')} Overall: ${overall ? chalk.green('HEALTHY') : chalk.red('DEGRADED')}`);
    
  } catch (error) {
    spin.stop();
    log.error(`Health check failed: ${error.message}`);
  }
};

// Deployment Status Command
const deploymentStatus = async () => {
  const spin = spinner('Fetching deployment status...').start();
  
  try {
    // Get Argo Rollout status
    const { stdout } = await execAsync(`kubectl get rollout ofm-social-os -n ${config.namespace} -o json`);
    const rollout = JSON.parse(stdout);
    
    spin.stop();
    
    log.header('\n🚀 Deployment Status');
    console.log('━'.repeat(50));
    
    const phase = rollout.status?.phase || 'Unknown';
    const canaryWeight = rollout.status?.canary?.weights?.canary || 0;
    const stableWeight = rollout.status?.canary?.weights?.stable || 100;
    const replicas = rollout.status?.replicas || 0;
    const readyReplicas = rollout.status?.readyReplicas || 0;
    const updatedReplicas = rollout.status?.updatedReplicas || 0;

    console.log(`Phase:           ${getPhaseColor(phase)} ${phase}`);
    console.log(`Canary Weight:   ${chalk.blue(canaryWeight)}%`);
    console.log(`Stable Weight:   ${chalk.green(stableWeight)}%`);
    console.log(`Replicas:        ${readyReplicas}/${replicas} ready, ${updatedReplicas} updated`);
    
    // Show current step
    if (rollout.status?.currentStepIndex !== undefined) {
      const currentStep = rollout.status.currentStepIndex + 1;
      const totalSteps = rollout.spec?.strategy?.canary?.steps?.length || 0;
      console.log(`Current Step:    ${currentStep}/${totalSteps}`);
    }

    // Show recent events
    try {
      const { stdout: events } = await execAsync(`kubectl get events -n ${config.namespace} --field-selector involvedObject.name=ofm-social-os --sort-by='.lastTimestamp' --limit=5`);
      console.log('\nRecent Events:');
      console.log(events);
    } catch {}
    
  } catch (error) {
    spin.stop();
    log.error(`Failed to get deployment status: ${error.message}`);
  }
};

const getPhaseColor = (phase: string) => {
  switch (phase.toLowerCase()) {
    case 'healthy': return chalk.green('●');
    case 'progressing': return chalk.blue('●');
    case 'degraded': return chalk.red('●');
    case 'paused': return chalk.yellow('●');
    default: return chalk.gray('●');
  }
};

// SLO Status Command
const sloStatus = async () => {
  const spin = spinner('Checking SLO compliance...').start();
  
  try {
    const slos = [
      {
        name: 'P95 Latency',
        query: 'histogram_quantile(0.95, sum by(le)(rate(http_request_duration_seconds_bucket[5m]))) * 1000',
        target: 10000,
        unit: 'ms',
        comparison: 'lt',
      },
      {
        name: 'Success Rate',
        query: '(sum(rate(http_requests_total{status!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100',
        target: 95,
        unit: '%',
        comparison: 'gt',
      },
      {
        name: 'Error Rate',
        query: '(sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100',
        target: 1,
        unit: '%',
        comparison: 'lt',
      },
      {
        name: 'Webhook Signatures',
        query: '(sum(rate(webhook_signature_verified_total[5m])) / sum(rate(webhook_signature_total[5m]))) * 100',
        target: 99.9,
        unit: '%',
        comparison: 'gt',
      },
    ];

    const results = await Promise.all(
      slos.map(async (slo) => {
        try {
          const response = await axios.get(`${config.prometheusUrl}/api/v1/query`, {
            params: { query: slo.query },
            timeout: 5000,
          });
          
          const value = parseFloat(response.data.data.result[0]?.value[1] || '0');
          const compliant = slo.comparison === 'lt' ? value < slo.target : value >= slo.target;
          
          return { ...slo, value, compliant };
        } catch {
          return { ...slo, value: null, compliant: null };
        }
      })
    );

    spin.stop();
    
    log.header('\n📊 SLO Compliance Status');
    console.log('━'.repeat(70));
    
    results.forEach((slo) => {
      const icon = slo.compliant === null ? chalk.gray('?') : 
                  slo.compliant ? chalk.green('✓') : chalk.red('✗');
      const valueStr = slo.value === null ? 'N/A' : `${slo.value.toFixed(2)}${slo.unit}`;
      const targetStr = `${slo.target}${slo.unit}`;
      const status = slo.compliant === null ? chalk.gray('UNKNOWN') :
                    slo.compliant ? chalk.green('PASS') : chalk.red('FAIL');
      
      console.log(`${icon} ${slo.name.padEnd(20)} ${valueStr.padEnd(12)} (target: ${targetStr.padEnd(10)}) ${status}`);
    });

    const overallCompliant = results.every(slo => slo.compliant !== false);
    console.log('━'.repeat(70));
    console.log(`${overallCompliant ? chalk.green('✓') : chalk.red('✗')} Overall SLO Compliance: ${overallCompliant ? chalk.green('PASS') : chalk.red('FAIL')}`);
    
  } catch (error) {
    spin.stop();
    log.error(`Failed to check SLOs: ${error.message}`);
  }
};

// Canary Management Commands
const canaryPromote = async () => {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to promote the canary deployment?',
    },
  ]);

  if (!confirm) {
    log.info('Canary promotion cancelled');
    return;
  }

  const spin = spinner('Promoting canary deployment...').start();
  
  try {
    await execAsync(`kubectl argo rollouts promote ofm-social-os -n ${config.namespace}`);
    spin.stop();
    log.success('Canary deployment promoted successfully');
  } catch (error) {
    spin.stop();
    log.error(`Failed to promote canary: ${error.message}`);
  }
};

const canaryAbort = async () => {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to abort the canary deployment?',
    },
  ]);

  if (!confirm) {
    log.info('Canary abort cancelled');
    return;
  }

  const spin = spinner('Aborting canary deployment...').start();
  
  try {
    await execAsync(`kubectl argo rollouts abort ofm-social-os -n ${config.namespace}`);
    await execAsync(`kubectl argo rollouts undo ofm-social-os -n ${config.namespace}`);
    spin.stop();
    log.success('Canary deployment aborted and rolled back');
  } catch (error) {
    spin.stop();
    log.error(`Failed to abort canary: ${error.message}`);
  }
};

const canaryPause = async () => {
  const spin = spinner('Pausing canary deployment...').start();
  
  try {
    await execAsync(`kubectl argo rollouts pause ofm-social-os -n ${config.namespace}`);
    spin.stop();
    log.success('Canary deployment paused');
  } catch (error) {
    spin.stop();
    log.error(`Failed to pause canary: ${error.message}`);
  }
};

const canaryResume = async () => {
  const spin = spinner('Resuming canary deployment...').start();
  
  try {
    await execAsync(`kubectl argo rollouts resume ofm-social-os -n ${config.namespace}`);
    spin.stop();
    log.success('Canary deployment resumed');
  } catch (error) {
    spin.stop();
    log.error(`Failed to resume canary: ${error.message}`);
  }
};

// Logs Command
const logs = async (options: { lines?: string; follow?: boolean; container?: string }) => {
  const lines = options.lines || '100';
  const follow = options.follow ? '-f' : '';
  const container = options.container ? `-c ${options.container}` : '';
  
  try {
    const cmd = `kubectl logs -n ${config.namespace} -l app=ofm-social-os ${container} --tail=${lines} ${follow}`;
    
    if (options.follow) {
      log.info('Streaming logs... Press Ctrl+C to stop');
      const child = exec(cmd);
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
      
      process.on('SIGINT', () => {
        child.kill();
        process.exit(0);
      });
    } else {
      const { stdout } = await execAsync(cmd);
      console.log(stdout);
    }
  } catch (error) {
    log.error(`Failed to get logs: ${error.message}`);
  }
};

// Database Operations
const dbBackup = async () => {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Create database backup now?',
    },
  ]);

  if (!confirm) {
    log.info('Database backup cancelled');
    return;
  }

  const spin = spinner('Creating database backup...').start();
  
  try {
    const backupName = `manual-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    
    // Trigger backup job
    await execAsync(`kubectl create job ${backupName} -n ${config.namespace} --from=cronjob/ofm-secure-backup`);
    
    spin.stop();
    log.success(`Database backup initiated: ${backupName}`);
    log.info('Use "ofm logs" to monitor backup progress');
  } catch (error) {
    spin.stop();
    log.error(`Failed to create backup: ${error.message}`);
  }
};

// Security Operations
const securityScan = async () => {
  const spin = spinner('Running security scan...').start();
  
  try {
    // Run security hardening check
    const { stdout } = await execAsync('./marketing/security/hardening/security-hardening-final.sh', {
      cwd: process.cwd(),
    });
    
    spin.stop();
    log.success('Security scan completed');
    console.log(stdout);
  } catch (error) {
    spin.stop();
    log.error(`Security scan failed: ${error.message}`);
  }
};

// Interactive Dashboard
const dashboard = async () => {
  const choices = [
    'Health Check',
    'Deployment Status',
    'SLO Status',
    'View Logs',
    'Promote Canary',
    'Abort Canary',
    'Database Backup',
    'Security Scan',
    'Exit',
  ];

  while (true) {
    console.clear();
    log.header('🎛️  OFM Social OS Operations Dashboard');
    console.log('━'.repeat(50));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Select an operation:',
        choices,
      },
    ]);

    console.log();

    switch (action) {
      case 'Health Check':
        await healthCheck();
        break;
      case 'Deployment Status':
        await deploymentStatus();
        break;
      case 'SLO Status':
        await sloStatus();
        break;
      case 'View Logs':
        await logs({ lines: '50' });
        break;
      case 'Promote Canary':
        await canaryPromote();
        break;
      case 'Abort Canary':
        await canaryAbort();
        break;
      case 'Database Backup':
        await dbBackup();
        break;
      case 'Security Scan':
        await securityScan();
        break;
      case 'Exit':
        log.info('Goodbye! 👋');
        process.exit(0);
      default:
        log.warning('Invalid selection');
    }

    if (action !== 'Exit') {
      console.log();
      await inquirer.prompt([
        {
          type: 'input',
          name: 'continue',
          message: 'Press Enter to continue...',
        },
      ]);
    }
  }
};

// CLI Setup
const program = new Command();

program
  .name('ofm-ops')
  .description('OFM Social OS Operations CLI')
  .version('1.0.0')
  .option('-e, --environment <env>', 'Environment (production, staging)', 'production')
  .option('-n, --namespace <ns>', 'Kubernetes namespace')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    if (options.environment) config.environment = options.environment;
    if (options.namespace) config.namespace = options.namespace;
  });

// Health Commands
program
  .command('health')
  .alias('h')
  .description('Check system health status')
  .action(healthCheck);

// Deployment Commands
const deployCmd = program
  .command('deploy')
  .alias('d')
  .description('Deployment management commands');

deployCmd
  .command('status')
  .description('Show deployment status')
  .action(deploymentStatus);

// Canary Commands  
const canaryCmd = program
  .command('canary')
  .alias('c')
  .description('Canary deployment management');

canaryCmd
  .command('promote')
  .description('Promote canary deployment')
  .action(canaryPromote);

canaryCmd
  .command('abort')
  .description('Abort canary deployment and rollback')
  .action(canaryAbort);

canaryCmd
  .command('pause')
  .description('Pause canary deployment')
  .action(canaryPause);

canaryCmd
  .command('resume')
  .description('Resume canary deployment')
  .action(canaryResume);

// SLO Commands
program
  .command('slo')
  .alias('s')
  .description('Check SLO compliance status')
  .action(sloStatus);

// Logs Commands
program
  .command('logs')
  .alias('l')
  .description('View application logs')
  .option('-n, --lines <number>', 'Number of lines to show', '100')
  .option('-f, --follow', 'Follow log output')
  .option('-c, --container <name>', 'Container name')
  .action(logs);

// Database Commands
const dbCmd = program
  .command('db')
  .description('Database operations');

dbCmd
  .command('backup')
  .description('Create database backup')
  .action(dbBackup);

// Security Commands
const secCmd = program
  .command('security')
  .description('Security operations');

secCmd
  .command('scan')
  .description('Run security scan')
  .action(securityScan);

// Dashboard Command
program
  .command('dashboard')
  .alias('dash')
  .description('Launch interactive operations dashboard')
  .action(dashboard);

// Config Commands
const configCmd = program
  .command('config')
  .description('Configuration management');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command('set <key> <value>')
  .description('Set configuration value')
  .action((key, value) => {
    const configPath = path.join(process.env.HOME || '', '.ofm-cli-config.json');
    const currentConfig = fs.existsSync(configPath) 
      ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
      : {};
    
    currentConfig[key] = value;
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
    log.success(`Configuration updated: ${key} = ${value}`);
  });

// Help and usage
program
  .command('help')
  .description('Show detailed help')
  .action(() => {
    console.log(chalk.bold.cyan('\n🎛️  OFM Social OS Operations CLI\n'));
    console.log('Common workflows:');
    console.log('');
    console.log('  ' + chalk.green('ofm-ops health') + '                    Check system health');
    console.log('  ' + chalk.green('ofm-ops deploy status') + '             Show deployment status');
    console.log('  ' + chalk.green('ofm-ops slo') + '                       Check SLO compliance');
    console.log('  ' + chalk.green('ofm-ops canary promote') + '            Promote canary deployment');
    console.log('  ' + chalk.green('ofm-ops canary abort') + '              Abort and rollback canary');
    console.log('  ' + chalk.green('ofm-ops logs -f') + '                   Stream live logs');
    console.log('  ' + chalk.green('ofm-ops dashboard') + '                 Launch interactive dashboard');
    console.log('');
    console.log('Configuration:');
    console.log('');
    console.log('  ' + chalk.green('ofm-ops config show') + '               Show current config');
    console.log('  ' + chalk.green('ofm-ops config set apiUrl <url>') + '   Set API URL');
    console.log('');
    console.log('For detailed help on any command, use: ' + chalk.yellow('ofm-ops <command> --help'));
    console.log('');
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (error) {
  if (error.code === 'commander.help' || error.code === 'commander.version') {
    // These are expected exits
    process.exit(0);
  } else {
    log.error(`CLI error: ${error.message}`);
    process.exit(1);
  }
}

// If no command specified, show dashboard
if (process.argv.length <= 2) {
  dashboard();
}