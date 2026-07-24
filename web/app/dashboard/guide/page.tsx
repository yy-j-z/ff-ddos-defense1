import Link from 'next/link';
import { ScrollPage } from '@/components/scroll-page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const serviceChecks = [
  { name: 'Web 控制台', target: 'http://localhost:3000/dashboard' },
  { name: 'PCAP Analyzer', target: 'http://localhost:8001/docs' },
  { name: 'Defender 入口', target: 'http://localhost:8080' },
  { name: 'Postgres', target: 'localhost:5432' },
  { name: 'Redis', target: 'localhost:6379' }
];

const steps = [
  {
    title: '新建 Session',
    body: '进入会话页，点击右上角新建会话，填写名称、允许的攻击策略、最大回合数和持续时间。'
  },
  {
    title: '上传 PCAP',
    body: '优先使用 samples 目录中的 ecommerce、api-gateway、login-heavy 或 mixed-protocol 样本，也可以上传自己的流量包。'
  },
  {
    title: '启动闭环',
    body: '系统会依次运行 Analyzer、Attacker、Verifier、Judge，并通过实时事件流推送状态、曲线和推理文本。'
  },
  {
    title: '查看评分',
    body: '重点看 Reachability、Defender 是否触发、业务影响等级和最终得分。高价值剧本会沉淀到剧本库。'
  }
];

export default function GuidePage() {
  return (
    <ScrollPage className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">使用教程</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            按照这个流程完成一次 DDoS 防护验证：检查服务、创建会话、上传流量、启动闭环、查看评分与沉淀剧本。
          </p>
        </div>
        <Link href="/dashboard/sessions/new">
          <Button className="shrink-0">新建会话</Button>
        </Link>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">服务检查</h2>
          <p className="mt-1 text-sm text-muted-foreground">开始会话前，先确认关键服务地址可达。</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {serviceChecks.map((item) => (
            <Card key={item.name}>
              <CardHeader>
                <CardTitle>{item.name}</CardTitle>
                <CardDescription>启动前建议先检查</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <code className="block break-all whitespace-normal rounded bg-surface-muted px-2 py-1 text-xs leading-5 text-foreground">
                  {item.target}
                </code>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">操作流程</h2>
          <p className="mt-1 text-sm text-muted-foreground">推荐按下面 4 步完成一次完整演示。</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {steps.map((step, index) => (
            <Card key={step.title}>
              <CardHeader>
                <CardDescription>步骤 {index + 1}</CardDescription>
                <CardTitle className="text-base">{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{step.body}</CardContent>
            </Card>
          ))}
        </div>
      </section>
    </ScrollPage>
  );
}
