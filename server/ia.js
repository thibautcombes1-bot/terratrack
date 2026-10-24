// Fournisseurs d'IA : Ollama en local (par défaut) ou Claude en ligne (si une clé est fournie).
import Anthropic from '@anthropic-ai/sdk';

const ollamaUrl = () => process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const claudeModele = () => process.env.CLAUDE_MODELE || 'claude-opus-5-5';
const claudeConfigure = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let clientClaude;

/** Ce qui est disponible, pour l'interface. */
export async function etatIA() {
  const etat = {
    ollama: { ok: false, modele: null },
    claude: { ok: claudeConfigure(), modele: claudeModele() },
  };
  try {
    const reponse = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const noms = (await reponse.json()).models.map((m) => m.name);
    etat.ollama = { ok: noms.length > 0, modele: modeleOllama(noms), modeles: noms };
  } catch {}
  return etat;
}

function modeleOllama(noms) {
  if (process.env.OLLAMA_MODELE) return process.env.OLLAMA_MODELE;
  return noms.find((n) => n.startsWith('qwen2.5')) ?? noms[0] ?? 'qwen2.5';
}

/**
 * Demande une réponse JSON conforme à `schema`.
 * @param {{ia: 'ollama'|'claude', systeme: string, message: string, schema: object}} demande
 */
export async function demanderJson({ ia, systeme, message, schema }) {
  return ia === 'claude'
    ? demanderClaude(systeme, message, schema)
    : demanderOllama(systeme, message, schema);
}

/** Nom affiché du modèle utilisé. */
export async function nomModele(ia) {
  if (ia === 'claude') return `${claudeModele()} (en ligne)`;
  return `${(await etatIA()).ollama.modele} (local)`;
}

async function demanderOllama(systeme, message, schema) {
  const { ollama } = await etatIA();
  if (!ollama.ok)
    throw new Error(`Ollama ne répond pas sur ${ollamaUrl()} : lance-le ou choisis Claude.`);
  const reponse = await fetch(`${ollamaUrl()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollama.modele,
      stream: false,
      format: schema,
      // num_predict : un modèle local peut boucler sans fin dans un JSON ; on coupe.
      options: { temperature: 0.5, num_ctx: 16384, num_predict: 3500 },
      messages: [
        { role: 'system', content: systeme },
        { role: 'user', content: message },
      ],
    }),
    signal: AbortSignal.timeout(6 * 60_000),
  });
  if (!reponse.ok) throw new Error(`Ollama a répondu ${reponse.status} : ${await reponse.text()}`);
  const contenu = (await reponse.json()).message.content;
  try {
    return JSON.parse(contenu);
  } catch {
    if (process.env.HORIZON_DEBUG) console.log('[ia] réponse illisible', contenu.slice(0, 2000));
    throw new Error("L'IA locale a rendu une réponse incomplète. Réessaie, ou choisis Claude.");
  }
}

/** Les sorties structurées de Claude n'acceptent pas les bornes de longueur : on les retire. */
function sansBornes(schema) {
  if (Array.isArray(schema)) return schema.map(sansBornes);
  if (!schema || typeof schema !== 'object') return schema;
  const { maxLength, maxItems, ...reste } = schema;
  return Object.fromEntries(Object.entries(reste).map(([cle, valeur]) => [cle, sansBornes(valeur)]));
}

async function demanderClaude(systeme, message, schema) {
  if (!claudeConfigure())
    throw new Error('Pas de clé Claude : ajoute ANTHROPIC_API_KEY dans le fichier .env.');
  clientClaude ??= new Anthropic();
  let reponse;
  try {
    reponse = await clientClaude.beta.messages.create({
      model: claudeModele(),
      max_tokens: 16000,
      // Si la demande est refusée par un filtre de sécurité, l'API la relance sur un autre modèle.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: sansBornes(schema) } },
      system: systeme,
      messages: [{ role: 'user', content: message }],
    });
  } catch (erreur) {
    if (erreur instanceof Anthropic.AuthenticationError)
      throw new Error('Clé Claude refusée : vérifie ANTHROPIC_API_KEY.');
    if (erreur instanceof Anthropic.RateLimitError)
      throw new Error('Claude est saturé pour ta clé : réessaie dans une minute.');
    if (erreur instanceof Anthropic.APIError)
      throw new Error(`Claude a répondu ${erreur.status} : ${erreur.message}`);
    throw erreur;
  }
  if (reponse.stop_reason === 'refusal') throw new Error('Claude a refusé cette demande.');
  if (reponse.stop_reason === 'max_tokens') throw new Error('Réponse de Claude coupée (trop longue).');
  const texte = reponse.content
    .filter((bloc) => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('');
  return JSON.parse(texte);
}
