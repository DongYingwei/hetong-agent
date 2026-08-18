<template>
  <div v-loading="loading">
    <div class="page-header-card mb-5 flex justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ c?.contract_name }}</h1>
        <p class="text-gray-500">
          合同号：{{ c?.contract_no }} | {{ c?.customer_name }}
        </p>
      </div>
      <el-button type="primary" @click="router.push(`/verify?id=${c?.id}`)">{{
        c?.verify_status === 1 ? "查看核对" : "核对合同"
      }}</el-button>
    </div>
    <el-tabs v-model="tab"
      ><el-tab-pane label="基本信息" name="basic"
        ><div class="content-card p-6">
          <group title="合同检索信息" :items="search" /><group
            title="合同-概要信息"
            :items="summary"
            class="mt-8"
          /></div></el-tab-pane
      ><el-tab-pane label="合同-金额及结算" name="money"
        ><div class="content-card p-6">
          <group title="合同-金额及结算" :items="money" /></div></el-tab-pane
      ><el-tab-pane label="合同-商务条款" name="business"
        ><div class="content-card p-6">
          <group title="合同-商务条款" :items="business" /></div></el-tab-pane
      ><el-tab-pane label="风控管理" name="risk"
        ><div class="content-card p-6">
          <group title="风控管理" :items="risk" /></div></el-tab-pane
      ><el-tab-pane label="关键词解析" name="keywords"
        ><div class="content-card p-6">
          <h3>AI关键词识别结果</h3>
          <div class="grid grid-cols-4 gap-4 mt-4">
            <div
              v-for="m in modules"
              :key="m.module_key"
              class="border rounded p-4"
            >
              <b>{{ m.name }}</b
              ><span
                class="float-right tag"
                :class="hit(m.module_key) ? 'tag-green' : 'tag-gray'"
                >{{ hit(m.module_key) ? "AI" : "未命中" }}</span
              >
              <p class="mt-3">
                {{ words(m.module_key) || "该板块未识别到AI关键词" }}
              </p>
            </div>
          </div>
          <div class="mt-5 pt-5 border-t">
            <h3 class="font-semibold mb-4">关键词命中明细</h3>
            <el-table
              :data="keywordHits"
              size="small"
              empty-text="暂无关键词命中明细"
            >
              <el-table-column
                prop="matched_term"
                label="关键词"
                min-width="130"
              />
              <el-table-column
                prop="keyword_name"
                label="所属大类"
                min-width="140"
              />
              <el-table-column label="命中板块" min-width="150"
                ><template #default="{ row }">{{
                  moduleName(row.module_key)
                }}</template></el-table-column
              >
              <el-table-column
                prop="paragraph_text"
                label="命中原文"
                min-width="320"
                show-overflow-tooltip
              />
            </el-table>
          </div></div></el-tab-pane
      ><el-tab-pane label="原文件预览" name="file"
        ><div class="content-card p-6">
          <el-select
            v-if="files.length"
            v-model="sourceId"
            style="width: 420px"
            @change="loadPdf"
            ><el-option
              v-for="file in files"
              :key="file.id"
              :label="file.name"
              :value="file.id" /></el-select
          ><el-empty v-else description="暂无可预览的 PDF 原文件" /><iframe
            v-if="pdfUrl"
            :src="pdfUrl"
            class="w-full h-[70vh] mt-4"
          /></div></el-tab-pane
    ></el-tabs>
  </div>
</template>
<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { contractApi, type ContractModule } from "../api/contractApi";
import { formatCurrency, formatDate } from "../utils/formatters";
import type { ContractLedger } from "../types";
const route = useRoute(),
  router = useRouter(),
  loading = ref(false),
  tab = ref("basic"),
  c = ref<ContractLedger | null>(null),
  modules = ref<ContractModule[]>([]),
  keywordHits = ref<any[]>([]),
  files = ref<Array<{ id: number; name: string }>>([]),
  sourceId = ref<number>(),
  pdfUrl = ref("");
const f = (l: string, v: any, s = "AI") => [l, v ?? "—", s];
const search = computed(() => [
  f("合同号", c.value?.contract_no, "手工"),
  f("客户名称", c.value?.customer_name),
  f("合同名称", c.value?.contract_name),
  f("考核线", c.value?.assessment_line, "手工"),
  f("中标编号", c.value?.bid_no, "手工"),
  f("关联主合同号", c.value?.related_main_no, "手工"),
  f("框架简称", c.value?.framework_alias, "手工"),
]);
const summary = computed(() => [
  f("客方合同号", c.value?.customer_contract_no),
  f("签约法人体", c.value?.signing_entity),
  f("合同类型", c.value?.contract_type),
  f("签约时间", formatDate(c.value?.sign_date || undefined)),
  f("开始时间", formatDate(c.value?.start_date || undefined)),
  f("结束时间", formatDate(c.value?.end_date || undefined)),
]);
const money = computed(() => [
  f("金额属性", c.value?.amount_type),
  f("合同金额(含税)", formatCurrency(c.value?.amount || 0)),
  f("税率", c.value?.tax_rate),
  f("结算条款", c.value?.settlement_terms),
]);
const business = computed(() => [
  f("是否涉及后评估", c.value?.post_eval),
  f("履约保证金金额", formatCurrency(c.value?.deposit_amount || 0)),
  f("履约保证金退还条件", c.value?.deposit_refund),
  f("仲裁方式", c.value?.arbitration),
  f("授权人", c.value?.authorizer),
]);
const risk = computed(() => [
  f("合同状态", c.value?.status, "手工"),
  f("合同断档预警", c.value?.warning_status ? "预警" : "无预警", "系统"),
]);
const group = defineComponent({
  props: { title: String, items: Array },
  setup: (p) => () =>
    h("section", [
      h("h3", { class: "font-semibold pb-3 border-b" }, p.title),
      h(
        "div",
        { class: "grid grid-cols-3 gap-x-12 gap-y-5 mt-4" },
        (p.items || []).map((x: any) =>
          h("div", { class: x[0] === "结算条款" ? "col-span-3" : "" }, [
            h("label", { class: "text-xs text-gray-500" }, [
              x[0],
              " ",
              h(
                "span",
                { class: x[2] === "AI" ? "tag tag-green" : "tag tag-gray" },
                x[2],
              ),
            ]),
            h(
              "p",
              {
                class:
                  x[0] === "结算条款"
                    ? "mt-2 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed"
                    : "whitespace-pre-wrap",
              },
              String(x[1]),
            ),
          ]),
        ),
      ),
    ]),
});
function hit(k: string) {
  return !!c.value?.module_hits?.some((x) => x.module_key === k && x.hit === 1);
}
function words(k: string) {
  return (
    c.value?.module_hits?.find((x) => x.module_key === k && x.hit === 1)
      ?.keywords || ""
  );
}
function moduleName(key: string | null) {
  return (
    modules.value.find((item) => item.module_key === key)?.name || "未归类"
  );
}
async function loadPdf() {
  if (!c.value || !sourceId.value) return;
  const token = localStorage.getItem("contract_token") || "";
  const response = await fetch(
    contractApi.getOriginalPdfUrl(c.value.id, sourceId.value),
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (response.ok) pdfUrl.value = URL.createObjectURL(await response.blob());
}
onMounted(async () => {
  loading.value = true;
  try {
    const [d, m] = await Promise.all([
      contractApi.getDetail(+route.params.id),
      contractApi.getModules(),
    ]);
    if (d.code === 200) {
      c.value = d.data.contract;
      const [hits, sources] = await Promise.all([
        contractApi.getKeywordHits(c.value.id),
        contractApi.getSourceFiles(c.value.id),
      ]);
      if (hits.code === 200) keywordHits.value = hits.data.list;
      files.value = sources.data?.list || [];
      sourceId.value = files.value[0]?.id;
      if (sourceId.value) await loadPdf();
    }
    if (m.code === 200) modules.value = m.data.list;
  } finally {
    loading.value = false;
  }
});
</script>
