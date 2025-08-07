#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { Ollama } from 'ollama';
import boxen from 'boxen';

// Helper dosyalarından importlar
import { buildTaskPlanPrompt } from '../core/promptTemplates/taskPlanner.js';
import { getSystemInfo } from '../utils/systemInformation.js';
import { askYesNo } from '../ui/prompt.js';
import { isCommandSafe } from '../utils/commandValidator.js';

/**
 * Verilen komut dizisini sırayla çalıştırır.
 * @param {string[]} commands Çalıştırılacak komutlar.
 */
async function executeCommands(commands) {
  for (const command of commands) {
    console.log(`\n$ ${chalk.yellow(command)}\n`);
    await new Promise((resolve, reject) => {
      // Komutu ve argümanları ayır (örn: "ls -la" -> ["ls", "-la"])
      const [cmd, ...args] = command.split(' ');
      
      // shell: true, 'ls -la | wc -l' gibi pipe içeren komutları doğru çalıştırır
      const spawned = spawn(cmd, args, { stdio: 'inherit', shell: true });

      spawned.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
      spawned.on('error', (err) => reject(err));
    });
  }
}

/**
 * 'ask' komutunun ana mantığını yönetir.
 */
async function handleAskCommand(argv) {
  try {
    const systemInfo = await getSystemInfo();
    const prompt = buildTaskPlanPrompt(argv.query, systemInfo);
  
    console.log(chalk.yellow('Waiting for a response from the mothership...'));
  
    const ollama = new Ollama({ host: 'http://localhost:11434' });
    
    const result = await ollama.generate({
      model: 'phi4', // Veya tercih ettiğiniz başka bir model
      prompt: prompt,
    });
    
    // --- ÖNEMLİ DÜZELTME ---
    // 'response' değişkenini 'let' ile tanımlıyoruz, çünkü değerini daha sonra değiştireceğiz.
    let response = result.response;
    console.log('Raw response from Ollama:', response);
    
    // LLM'in cevabından saf JSON'ı ayıkla
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Eşleşen dizinin ilk elemanı bizim JSON metnimizdir.
      response = jsonMatch[0];
      console.log('Cleaned JSON:', response);
    } else {
      throw new Error("Could not find a valid JSON object in the LLM's response.");
    }

    try {
      const llmResponse = JSON.parse(response);
      const { plan_steps, commands } = llmResponse;

      if (!plan_steps || !commands || !Array.isArray(plan_steps) || !Array.isArray(commands)) {
        throw new Error('Invalid JSON structure from LLM. "plan_steps" and "commands" arrays are required.');
      }

      // Planı kullanıcıya göster
      console.log(boxen(
        chalk.bold('Execution Plan:\n\n') +
        plan_steps.map(step => `• ${step}`).join('\n') +
        `\n\n` + chalk.bold('Commands to be executed:\n') +
        commands.map(cmd => `  $ ${chalk.cyan(cmd)}`).join('\n'),
        { padding: 1, margin: 1, borderStyle: 'round', title: 'Cloi Terminal Helper', titleAlignment: 'center' }
      ));

      // Komutları güvenlik için doğrula
      if (!commands.every(isCommandSafe)) {
        console.error(chalk.red('Error: A potentially dangerous command was detected. Aborting.'));
        return;
      }

      // Kullanıcıdan onay al
      const proceed = await askYesNo('Proceed with execution?');
      if (proceed) {
        await executeCommands(commands);
        console.log(chalk.green('\n✅ Task completed successfully!'));
      } else {
        console.log('Aborted by user.');
      }

    } catch (parseError) {
      // JSON parse hatasını daha detaylı yakala
      console.error(chalk.red('\nFailed to parse LLM response.'));
      console.error('Original response was:', result.response); // Orijinal, temizlenmemiş çıktıyı göster
      console.error('Parse error:', parseError.message);
    }

  } catch (error) {
    console.error(chalk.red('\nAn error occurred during the process:'), error.message);
  }
}

// Yargs CLI yapılandırması
yargs(hideBin(process.argv))
  .command(
    'ask <query>',
    'Ask the terminal helper to perform a task',
    (yargs) => {
      return yargs.positional('query', {
        describe: 'The natural language query for the task',
        type: 'string',
      });
    },
    handleAskCommand
  )
  .demandCommand(1, 'You must provide a query to the "ask" command.')
  .help()
  .argv;