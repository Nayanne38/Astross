// Emergency contacts shown on /urgencia. Single config file: edit here only.
// Checked 2026-11-15 against state government pages (national numbers standardized by Anatel).
// Defesa Civil service can vary by municipality.
export const EMERGENCY = {
  checkedOn: "15/11/2026",
  contacts: [
    { number: "193", name: "Corpo de Bombeiros", when: "Fogo perto de pessoas, casas ou estradas; resgate e salvamento." },
    { number: "199", name: "Defesa Civil", when: "Risco coletivo, fumaça intensa, necessidade de evacuação. O atendimento pode variar por município." },
  ],
  sources: [
    { label: "Governo de Minas Gerais: atendimento de urgência pelo Corpo de Bombeiros (193)", url: "https://www.mg.gov.br/servico/solicitar-atendimento-de-urgencia-e-emergencia-pelo-corpo-de-bombeiros-militar" },
    { label: "Corpo de Bombeiros do Estado do Rio de Janeiro: em caso de emergência, disque 193", url: "https://www.cbmerj.rj.gov.br/?p=30222" },
    { label: "Prefeitura de Porto Alegre: risco de incêndio, ligue 199 (Defesa Civil)", url: "https://prefeitura.poa.br/carta-de-servicos/risco-de-incendio-ligue-199" },
  ],
} as const;
