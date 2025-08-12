#!/usr/bin/env node

// CLI tool for LLM budget reporting and management
// Usage: npm run llm:report -- --month=2025-01 --creator=uuid

import { program } from 'commander';
import { budgetManager } from '../lib/llm-budget';
import { db } from '../lib/db';
import chalk from 'chalk';
import Table from 'cli-table3';

interface ReportOptions {
  month?: string;
  creator?: string;
  format?: 'table' | 'json' | 'csv';
  output?: string;
  top?: number;
}

program
  .name('llm-report')
  .description('Generate LLM budget and usage reports')
  .version('1.0.0');

program
  .command('usage')
  .description('Generate usage report')
  .option('-m, --month <month>', 'Month in YYYY-MM format', getCurrentMonth())
  .option('-c, --creator <uuid>', 'Specific creator ID')
  .option('-f, --format <format>', 'Output format (table|json|csv)', 'table')
  .option('-o, --output <file>', 'Output file path')
  .option('-t, --top <number>', 'Show top N results', '10')
  .action(generateUsageReport);

program
  .command('budget')
  .description('Show budget status')
  .option('-c, --creator <uuid>', 'Specific creator ID')
  .option('-m, --month <month>', 'Month in YYYY-MM format', getCurrentMonth())
  .option('-a, --all', 'Show all creators')
  .action(showBudgetStatus);

program
  .command('alerts')
  .description('Show budget alerts')
  .option('-m, --month <month>', 'Month in YYYY-MM format')
  .option('-t, --type <type>', 'Alert type (soft_limit|hard_limit)')
  .option('--unsent', 'Show only unsent webhook alerts')
  .action(showBudgetAlerts);

program
  .command('pricing')
  .description('Show current pricing information')
  .option('-p, --provider <provider>', 'Filter by provider')
  .option('-m, --model <model>', 'Filter by model')
  .action(showPricing);

program
  .command('top-users')
  .description('Show top LLM users by cost')
  .option('-m, --month <month>', 'Month in YYYY-MM format', getCurrentMonth())
  .option('-l, --limit <number>', 'Number of users to show', '10')
  .action(showTopUsers);

program
  .command('forecast')
  .description('Forecast monthly usage based on current trends')
  .option('-c, --creator <uuid>', 'Specific creator ID')
  .option('-d, --days <number>', 'Days of history to analyze', '7')
  .action(forecastUsage);

program
  .command('cleanup')
  .description('Clean up expired reservations')
  .option('--dry-run', 'Show what would be cleaned without actually doing it')
  .action(cleanupReservations);

async function generateUsageReport(options: ReportOptions) {
  try {
    console.log(chalk.blue('Generating LLM usage report...'));
    
    if (options.creator) {
      // Single creator report
      const report = await budgetManager.getUsageReport(options.creator, options.month!);
      const creatorInfo = await getCreatorInfo(options.creator);
      
      console.log(chalk.green(`\nUsage Report for ${creatorInfo.display_name} (${options.month})`));
      console.log('='.repeat(60));
      
      // Summary
      console.log(chalk.yellow('\nSUMMARY'));
      const summaryTable = new Table();
      summaryTable.push(
        ['Total Requests', report.summary.total_requests || 0],
        ['Input Tokens', formatNumber(report.summary.total_input_tokens || 0)],
        ['Output Tokens', formatNumber(report.summary.total_output_tokens || 0)],
        ['Total Cost', formatCurrency(report.summary.total_cost || 0)],
        ['Avg Cost/Request', formatCurrency(report.summary.avg_cost_per_request || 0)],
        ['Cached Responses', report.summary.cached_responses || 0]
      );
      console.log(summaryTable.toString());
      
      // By Model
      if (report.byModel.length > 0) {
        console.log(chalk.yellow('\nTOP MODELS BY COST'));
        const modelTable = new Table({
          head: ['Model', 'Requests', 'Cost', 'Avg Cost', 'Input Tokens', 'Output Tokens']
        });
        
        report.byModel.slice(0, parseInt(options.top || '10')).forEach(model => {
          modelTable.push([
            model.model,
            model.requests,
            formatCurrency(model.cost),
            formatCurrency(model.avg_cost),
            formatNumber(model.input_tokens),
            formatNumber(model.output_tokens)
          ]);
        });
        
        console.log(modelTable.toString());
      }
      
      // By Operation
      if (report.byOperation.length > 0) {
        console.log(chalk.yellow('\nBY OPERATION TYPE'));
        const opTable = new Table({
          head: ['Operation', 'Requests', 'Cost', 'Avg Cost']
        });
        
        report.byOperation.forEach(op => {
          opTable.push([
            op.operation_type,
            op.requests,
            formatCurrency(op.cost),
            formatCurrency(op.avg_cost)
          ]);
        });
        
        console.log(opTable.toString());
      }
      
    } else {
      // System-wide report
      const result = await db.query(`
        SELECT 
          c.display_name,
          u.creator_id,
          COUNT(*) as requests,
          SUM(u.total_usd_cost) as total_cost,
          AVG(u.total_usd_cost) as avg_cost,
          SUM(u.input_tokens) as input_tokens,
          SUM(u.output_tokens) as output_tokens
        FROM llm_usage u
        JOIN creators c ON u.creator_id = c.id
        WHERE date_trunc('month', u.created_at) = ($1 || '-01')::DATE
        GROUP BY u.creator_id, c.display_name
        ORDER BY total_cost DESC
        LIMIT $2
      `, [options.month, parseInt(options.top || '10')]);
      
      console.log(chalk.green(`\nSystem-wide LLM Usage Report (${options.month})`));
      console.log('='.repeat(80));
      
      const table = new Table({
        head: ['Creator', 'Requests', 'Total Cost', 'Avg Cost', 'Input Tokens', 'Output Tokens']
      });
      
      result.rows.forEach(row => {
        table.push([
          row.display_name,
          row.requests,
          formatCurrency(row.total_cost),
          formatCurrency(row.avg_cost),
          formatNumber(row.input_tokens),
          formatNumber(row.output_tokens)
        ]);
      });
      
      console.log(table.toString());
      
      // Total summary
      const totalResult = await db.query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(total_usd_cost) as total_cost,
          COUNT(DISTINCT creator_id) as total_creators
        FROM llm_usage
        WHERE date_trunc('month', created_at) = ($1 || '-01')::DATE
      `, [options.month]);
      
      const totals = totalResult.rows[0];
      console.log(chalk.blue('\nTOTALS'));
      console.log(`Creators with usage: ${totals.total_creators}`);
      console.log(`Total requests: ${formatNumber(totals.total_requests)}`);
      console.log(`Total cost: ${formatCurrency(totals.total_cost)}`);
    }
    
  } catch (error) {
    console.error(chalk.red('Error generating report:'), error);
    process.exit(1);
  }
}

async function showBudgetStatus(options: any) {
  try {
    console.log(chalk.blue('Budget Status Report...'));
    
    if (options.creator) {
      // Single creator
      const status = await budgetManager.getBudgetStatus(options.creator, options.month);
      const creatorInfo = await getCreatorInfo(options.creator);
      
      console.log(chalk.green(`\nBudget Status for ${creatorInfo.display_name}`));
      console.log('='.repeat(50));
      
      const table = new Table();
      table.push(
        ['Month', options.month],
        ['Budget Limit', formatCurrency(status.budgetLimit)],
        ['Current Usage', formatCurrency(status.currentUsage)],
        ['Reserved', formatCurrency(status.reservedAmount)],
        ['Available', formatCurrency(status.availableBudget)],
        ['Usage %', `${status.usagePercentage}%`],
        ['Soft Limit Reached', status.softLimitReached ? chalk.yellow('YES') : 'NO'],
        ['Hard Limit Reached', status.hardLimitReached ? chalk.red('YES') : chalk.green('NO')]
      );
      
      console.log(table.toString());
      
      if (status.topModels && status.topModels.length > 0) {
        console.log(chalk.yellow('\nTop Models by Cost:'));
        status.topModels.forEach((model: any, i: number) => {
          console.log(`${i + 1}. ${model.model}: ${formatCurrency(model.cost)} (${model.requests} requests)`);
        });
      }
      
    } else if (options.all) {
      // All creators
      const result = await db.query(`
        SELECT 
          c.display_name,
          c.id,
          b.*
        FROM creators c
        LEFT JOIN llm_budgets b ON c.id = b.creator_id AND b.month_year = $1
        ORDER BY c.display_name
      `, [options.month]);
      
      console.log(chalk.green(`\nAll Creator Budgets (${options.month})`));
      console.log('='.repeat(80));
      
      const table = new Table({
        head: ['Creator', 'Budget Limit', 'Soft Limit %', 'Hard Stop']
      });
      
      for (const row of result.rows) {
        const status = await budgetManager.getBudgetStatus(row.id, options.month);
        
        table.push([
          row.display_name,
          formatCurrency(status.budgetLimit),
          `${row.soft_limit_pct || 80}%`,
          row.hard_stop !== false ? 'YES' : 'NO'
        ]);
      }
      
      console.log(table.toString());
    }
    
  } catch (error) {
    console.error(chalk.red('Error showing budget status:'), error);
    process.exit(1);
  }
}

async function showBudgetAlerts(options: any) {
  try {
    console.log(chalk.blue('Budget Alerts Report...'));
    
    let query = `
      SELECT 
        a.*,
        c.display_name
      FROM llm_budget_alerts a
      JOIN creators c ON a.creator_id = c.id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 0;
    
    if (options.month) {
      query += ` AND a.month_year = $${++paramIndex}`;
      params.push(options.month);
    }
    
    if (options.type) {
      query += ` AND a.alert_type = $${++paramIndex}`;
      params.push(options.type);
    }
    
    if (options.unsent) {
      query += ` AND NOT a.webhook_sent`;
    }
    
    query += ` ORDER BY a.triggered_at DESC LIMIT 50`;
    
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      console.log(chalk.yellow('No alerts found matching criteria.'));
      return;
    }
    
    const table = new Table({
      head: ['Creator', 'Type', 'Month', 'Usage', 'Limit', 'Triggered', 'Webhook Sent']
    });
    
    result.rows.forEach(alert => {
      table.push([
        alert.display_name,
        alert.alert_type,
        alert.month_year,
        formatCurrency(alert.current_usage),
        formatCurrency(alert.budget_limit),
        new Date(alert.triggered_at).toLocaleDateString(),
        alert.webhook_sent ? chalk.green('YES') : chalk.red('NO')
      ]);
    });
    
    console.log(table.toString());
    console.log(`\nTotal alerts: ${result.rows.length}`);
    
  } catch (error) {
    console.error(chalk.red('Error showing alerts:'), error);
    process.exit(1);
  }
}

async function showPricing(options: any) {
  try {
    console.log(chalk.blue('LLM Pricing Information...'));
    
    let query = `
      SELECT DISTINCT ON (provider, model) 
        provider, model, 
        input_cost_per_1m_tokens,
        output_cost_per_1m_tokens,
        effective_date,
        source_url
      FROM llm_pricing
    `;
    
    const params: any[] = [];
    let paramIndex = 0;
    
    if (options.provider) {
      query += ` WHERE provider = $${++paramIndex}`;
      params.push(options.provider);
    }
    
    if (options.model) {
      query += options.provider ? ' AND' : ' WHERE';
      query += ` model = $${++paramIndex}`;
      params.push(options.model);
    }
    
    query += ` ORDER BY provider, model, effective_date DESC`;
    
    const result = await db.query(query, params);
    
    const table = new Table({
      head: ['Provider', 'Model', 'Input (per 1M)', 'Output (per 1M)', 'Updated']
    });
    
    result.rows.forEach(row => {
      table.push([
        row.provider,
        row.model,
        formatCurrency(row.input_cost_per_1m_tokens),
        formatCurrency(row.output_cost_per_1m_tokens),
        new Date(row.effective_date).toLocaleDateString()
      ]);
    });
    
    console.log(table.toString());
    
  } catch (error) {
    console.error(chalk.red('Error showing pricing:'), error);
    process.exit(1);
  }
}

async function showTopUsers(options: any) {
  try {
    console.log(chalk.blue(`Top LLM Users by Cost (${options.month})`));
    
    const result = await db.query(`
      SELECT 
        c.display_name,
        u.creator_id,
        COUNT(*) as requests,
        SUM(u.total_usd_cost) as total_cost,
        AVG(u.total_usd_cost) as avg_cost_per_request,
        COUNT(DISTINCT u.provider || '/' || u.model) as unique_models,
        MAX(u.created_at) as last_request
      FROM llm_usage u
      JOIN creators c ON u.creator_id = c.id
      WHERE date_trunc('month', u.created_at) = ($1 || '-01')::DATE
      GROUP BY u.creator_id, c.display_name
      ORDER BY total_cost DESC
      LIMIT $2
    `, [options.month, parseInt(options.limit)]);
    
    const table = new Table({
      head: ['Creator', 'Requests', 'Total Cost', 'Avg Cost', 'Models', 'Last Request']
    });
    
    result.rows.forEach((row, i) => {
      const prefix = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      
      table.push([
        `${prefix} ${row.display_name}`,
        formatNumber(row.requests),
        formatCurrency(row.total_cost),
        formatCurrency(row.avg_cost_per_request),
        row.unique_models,
        new Date(row.last_request).toLocaleDateString()
      ]);
    });
    
    console.log(table.toString());
    
  } catch (error) {
    console.error(chalk.red('Error showing top users:'), error);
    process.exit(1);
  }
}

async function forecastUsage(options: any) {
  try {
    console.log(chalk.blue('Forecasting monthly usage...'));
    
    const daysAnalyzed = parseInt(options.days);
    const currentMonth = getCurrentMonth();
    
    let query = `
      SELECT 
        creator_id,
        COUNT(*) as requests,
        SUM(total_usd_cost) as cost
      FROM llm_usage
      WHERE created_at > NOW() - INTERVAL '${daysAnalyzed} days'
    `;
    
    const params: any[] = [];
    
    if (options.creator) {
      query += ` AND creator_id = $1`;
      params.push(options.creator);
    }
    
    query += ` GROUP BY creator_id`;
    
    const result = await db.query(query, params);
    
    console.log(chalk.green(`\nUsage Forecast (based on last ${daysAnalyzed} days)`));
    console.log('='.repeat(60));
    
    const table = new Table({
      head: ['Creator', 'Daily Avg', 'Monthly Forecast', 'Trend']
    });
    
    for (const row of result.rows) {
      const creatorInfo = await getCreatorInfo(row.creator_id);
      const dailyAvg = row.cost / daysAnalyzed;
      const monthlyForecast = dailyAvg * 30;
      
      // Get budget for trend analysis
      const budget = await budgetManager.getBudgetStatus(row.creator_id, currentMonth);
      const trend = monthlyForecast > budget.budgetLimit ? 
        chalk.red('Over Budget') : 
        monthlyForecast > budget.budgetLimit * 0.8 ? 
          chalk.yellow('Near Limit') : 
          chalk.green('On Track');
      
      table.push([
        creatorInfo.display_name,
        formatCurrency(dailyAvg),
        formatCurrency(monthlyForecast),
        trend
      ]);
    }
    
    console.log(table.toString());
    
  } catch (error) {
    console.error(chalk.red('Error forecasting usage:'), error);
    process.exit(1);
  }
}

async function cleanupReservations(options: any) {
  try {
    if (options.dryRun) {
      console.log(chalk.blue('Dry run: Checking expired reservations...'));
      
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM llm_usage_reservations
        WHERE expires_at < NOW() AND NOT consumed
      `);
      
      console.log(`Would clean up ${result.rows[0].count} expired reservations.`);
    } else {
      console.log(chalk.blue('Cleaning up expired reservations...'));
      
      const cleanedCount = await budgetManager.cleanupExpiredReservations();
      console.log(chalk.green(`Cleaned up ${cleanedCount} expired reservations.`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error during cleanup:'), error);
    process.exit(1);
  }
}

// Helper functions
function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function formatCurrency(amount: number | string): string {
  const num = parseFloat(amount.toString()) || 0;
  return `$${num.toFixed(6)}`;
}

function formatNumber(num: number | string): string {
  return parseInt(num.toString()).toLocaleString();
}

async function getCreatorInfo(creatorId: string) {
  const result = await db.query('SELECT display_name, email FROM creators WHERE id = $1', [creatorId]);
  return result.rows[0] || { display_name: 'Unknown Creator', email: null };
}

// Parse and execute
program.parse();

// TODO-1: Add export functionality (CSV, JSON) for reports
// TODO-2: Add interactive mode for budget configuration
// TODO-3: Add visualization options with charts