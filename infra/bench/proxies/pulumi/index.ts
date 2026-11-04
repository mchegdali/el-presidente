// Serveurs jetables du banc des proxys (voir ../PROXIES.md) :
// - sut : CX23 (2 vCPU partagés, comme la production), proxy + API + Postgres ;
// - loadgen : CCX23 (4 vCPU dédiés), générateurs de charge ;
// reliés par un réseau privé (le trafic mesuré), IPv6 publique seulement (administration).
//   pulumi up      puis      pulumi destroy
import * as hcloud from '@pulumi/hcloud';
import * as pulumi from '@pulumi/pulumi';

const location = 'hel1';
const image = 'ubuntu-26.04';

// Clé existante du projet Hetzner (aucune clé créée ici).
const sshKey = hcloud.getSshKeyOutput({ name: 'desktop-windows' });

const network = new hcloud.Network('bench', { name: 'bench', ipRange: '10.0.0.0/16' });
const subnet = new hcloud.NetworkSubnet('bench', {
  networkId: network.id.apply(Number),
  type: 'cloud',
  networkZone: 'eu-central',
  ipRange: '10.0.0.0/24',
});

// Pare-feu des interfaces publiques : SSH et ping seulement. Il ne s'applique pas au réseau
// privé, par lequel passe tout le trafic du banc.
const firewall = new hcloud.Firewall('bench', {
  name: 'bench',
  rules: [
    { direction: 'in', protocol: 'tcp', port: '22', sourceIps: ['::/0', '0.0.0.0/0'] },
    { direction: 'in', protocol: 'icmp', sourceIps: ['::/0', '0.0.0.0/0'] },
  ],
});

function server(role: string, serverType: string, ip: string) {
  return new hcloud.Server(
    role,
    {
      name: `bench-${role}`,
      serverType,
      image,
      location,
      sshKeys: [
        sshKey.apply((k) => {
          if (k.id === undefined) throw new Error('clé SSH « desktop-windows » introuvable dans le projet Hetzner');
          return String(k.id);
        }),
      ],
      firewallIds: [firewall.id.apply(Number)],
      publicNets: [{ ipv4Enabled: false, ipv6Enabled: true }],
      networks: [{ networkId: network.id.apply(Number), ip }],
      labels: { purpose: 'bench-proxies' },
    },
    { dependsOn: [subnet] },
  );
}

const sut = server('sut', 'cx23', '10.0.0.3');
const loadgen = server('loadgen', 'ccx23', '10.0.0.2');

export const sutHost = pulumi.interpolate`root@${sut.ipv6Address}`;
export const loadgenHost = pulumi.interpolate`root@${loadgen.ipv6Address}`;
export const sutPrivateIp = '10.0.0.3';
