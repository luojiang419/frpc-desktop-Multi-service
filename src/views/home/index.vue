<script lang="ts" setup>
import Breadcrumb from "@/layout/compoenets/Breadcrumb.vue";
import router from "@/router";
import { useFrpcDesktopStore } from "@/store/frpcDesktop";
import { on, removeRouterListeners, send } from "@/utils/ipcUtils";
import { useDebounceFn } from "@vueuse/core";
import { ElMessageBox } from "element-plus";
import {
  computed,
  defineComponent,
  onMounted,
  onUnmounted,
  ref,
  watch
} from "vue";
import { useI18n } from "vue-i18n";
import { ipcRouters } from "../../../electron/core/IpcRouter";

defineComponent({
  name: "Home"
});

const frpcDesktopStore = useFrpcDesktopStore();
const loading = ref(false);
const launchDialogVisible = ref(false);
const latestLaunchSummary = ref<FrpcLaunchSummary | null>(null);
const { t } = useI18n();

const frpcStatus = computed(() => frpcDesktopStore.frpcSummaryStatus);

const handleStartFrpc = () => {
  send(ipcRouters.LAUNCH.launch);
};

const handleStopFrpc = () => {
  send(ipcRouters.LAUNCH.terminate);
};

const handleButtonClick = useDebounceFn(() => {
  loading.value = true;
  if (frpcDesktopStore.frpcProcessRunning) {
    handleStopFrpc();
  } else {
    handleStartFrpc();
  }
}, 300);

const uptime = computed(() => {
  if (frpcDesktopStore.frpcProcessUptime < 0) {
    return "";
  }
  const uptimeValue = frpcDesktopStore.frpcProcessUptime / 1000;
  const days = Math.floor(uptimeValue / (24 * 60 * 60));
  const hours = Math.floor((uptimeValue % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptimeValue % (60 * 60)) / 60);
  const seconds = Math.ceil(uptimeValue % 60);
  let result = "";
  if (days > 0) {
    result += t("home.uptime.days", { days });
  }
  if (hours > 0) {
    result += t("home.uptime.hours", { hours });
  }
  if (minutes > 0) {
    result += t("home.uptime.minutes", { minutes });
  }
  result += t("home.uptime.seconds", { seconds });
  return result;
});

const firstError = computed(() => {
  return (
    frpcDesktopStore.frpcLaunchResults.find(item => item.connectionError)
      ?.connectionError ||
    frpcDesktopStore.frpcLaunchResults.find(
      item =>
        item.lastStartTime > 0 && !item.running && !item.success && item.message
    )?.message ||
    null
  );
});

const summaryText = computed(() => {
  return t("home.status.summary", {
    running: frpcDesktopStore.frpcRunningCount,
    total: frpcDesktopStore.frpcTotalCount
  });
});

const openLaunchSummary = () => {
  if (latestLaunchSummary.value?.results?.length) {
    launchDialogVisible.value = true;
  }
};

const openServerLog = (serverId: string) => {
  launchDialogVisible.value = false;
  router.replace({
    name: "Logger",
    query: { serverId }
  });
};

watch(
  () => frpcDesktopStore.frpcProcessRunning,
  () => {
    loading.value = false;
  }
);

onMounted(() => {
  on(
    ipcRouters.LAUNCH.launch,
    data => {
      latestLaunchSummary.value = data;
      frpcDesktopStore.hydrateProcessSummary(data);
      if (data?.results?.length) {
        launchDialogVisible.value = true;
      }
      frpcDesktopStore.refreshRunning();
      loading.value = false;
    },
    (bizCode: string) => {
      if (bizCode === "B1001") {
        ElMessageBox.alert(
          t("home.alert.configRequired.message"),
          t("home.alert.configRequired.title"),
          {
            confirmButtonText: t("home.alert.configRequired.confirm")
          }
        ).then(() => {
          router.replace({
            name: "Config"
          });
        });
      } else if (bizCode === "B1005") {
        ElMessageBox.alert(
          t("home.alert.versionNotFound.message"),
          t("home.alert.versionNotFound.title"),
          {
            confirmButtonText: t("home.alert.versionNotFound.confirm")
          }
        ).then(() => {
          router.replace({
            name: "Config"
          });
        });
      }
      loading.value = false;
    }
  );

  on(ipcRouters.LAUNCH.terminate, data => {
    latestLaunchSummary.value = data;
    frpcDesktopStore.hydrateProcessSummary(data);
    frpcDesktopStore.refreshRunning();
    loading.value = false;
  });
});

onUnmounted(() => {
  removeRouterListeners(ipcRouters.LAUNCH.launch);
  removeRouterListeners(ipcRouters.LAUNCH.terminate);
});
</script>

<template>
  <div class="main">
    <breadcrumb />
    <div class="app-container-breadcrumb">
      <div
        class="flex overflow-y-auto justify-center items-center p-4 w-full h-full bg-white rounded drop-shadow-lg"
      >
        <div class="flex">
          <div
            class="w-52 h-52 !border-4 border-[#5A3DAA] text-[#5A3DAA] rounded-full flex justify-center items-center text-[100px] relative"
          >
            <transition name="fade">
              <div
                v-show="frpcDesktopStore.frpcProcessRunning"
                class="z-0 rounded-full opacity-20 left-circle bg-[#5A3DAA] w-full h-full animation-rotate-1"
              />
            </transition>
            <transition name="fade">
              <div
                v-show="frpcDesktopStore.frpcProcessRunning"
                class="z-0 rounded-full opacity-20 right-circle top-[10px] bg-[#5A3DAA] w-full h-full animation-rotate-2"
              />
            </transition>
            <transition name="fade">
              <div
                v-show="frpcDesktopStore.frpcProcessRunning"
                class="z-0 rounded-full opacity-20 top-circle bg-[#5A3DAA] w-full h-full animation-rotate-3"
              />
            </transition>
            <div
              class="flex absolute z-10 justify-center items-center w-full h-full bg-white rounded-full"
            >
              <IconifyIconOffline icon="rocket-launch-rounded" />
            </div>
          </div>
          <div class="flex flex-col justify-center items-center">
            <div class="flex flex-col gap-4 justify-between pl-10 w-[420px]">
              <div class="flex gap-1 justify-center text-2xl font-bold text-center">
                <IconifyIconOffline
                  v-if="frpcStatus === 'running'"
                  class="text-[#7EC050] inline-block relative top-1"
                  icon="check-circle-rounded"
                />
                <IconifyIconOffline
                  v-else-if="frpcStatus === 'error'"
                  class="text-[#E6A23C] inline-block relative top-1"
                  icon="warningRounded"
                />
                <IconifyIconOffline
                  v-else
                  class="text-[#E47470] inline-block relative top-1"
                  icon="error"
                />
                <span>
                  {{
                    $t("home.status.frpcStatus", {
                      status:
                        frpcStatus === "running"
                          ? $t("home.status.running")
                          : frpcStatus === "error"
                            ? $t("home.status.connectionError")
                            : $t("home.status.disconnected")
                    })
                  }}
                </span>
              </div>

              <div class="text-sm text-center text-slate-500">
                {{ summaryText }}
              </div>

              <div
                v-if="frpcStatus === 'error' && firstError"
                class="justify-center w-full text-sm text-center animate__animated animate__fadeIn"
              >
                <el-text class="break-all line-clamp-2 text-primary" :title="firstError">
                  {{ firstError }}
                </el-text>
                <div class="flex gap-3 justify-center mt-2">
                  <el-link type="primary" @click="openLaunchSummary">
                    {{ $t("home.button.viewServers") }}
                  </el-link>
                  <el-link type="primary" @click="$router.replace({ name: 'Logger' })">
                    {{ $t("home.button.viewLog") }}
                  </el-link>
                </div>
              </div>

              <div
                v-else-if="frpcDesktopStore.frpcProcessRunning"
                class="justify-center w-full text-sm text-center animate__animated animate__fadeIn"
              >
                <span class="el-text--success">{{ $t("home.status.runningTime") }}</span>
                <span class="ml-1 font-bold text-primary">{{ uptime }}</span>
                <div class="flex gap-3 justify-center mt-2">
                  <el-link type="primary" @click="openLaunchSummary">
                    {{ $t("home.button.viewServers") }}
                  </el-link>
                  <el-link type="primary" @click="$router.replace({ name: 'Logger' })">
                    {{ $t("home.button.viewLog") }}
                  </el-link>
                </div>
              </div>

              <el-button class="mt-4" type="primary" :disabled="loading" @click="handleButtonClick">
                {{
                  frpcDesktopStore.frpcProcessRunning
                    ? $t("home.button.stop")
                    : $t("home.button.start")
                }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="launchDialogVisible"
      :title="$t('home.dialog.serverStatus.title')"
      width="720"
    >
      <div class="grid gap-4">
        <div
          v-for="item in latestLaunchSummary?.results || frpcDesktopStore.frpcLaunchResults"
          :key="item.serverId"
          class="p-4 border border-slate-200 rounded-xl"
        >
          <div class="flex justify-between items-start gap-3">
            <div>
              <div class="text-base font-semibold text-slate-900">{{ item.name }}</div>
              <div class="text-sm text-slate-500">
                {{ item.serverAddr }}:{{ item.serverPort }}
              </div>
            </div>
            <el-tag :type="item.running && !item.connectionError ? 'success' : item.lastStartTime > 0 ? 'warning' : 'info'">
              {{
                item.running && !item.connectionError
                  ? $t("home.dialog.serverStatus.running")
                  : item.lastStartTime > 0
                    ? $t("home.dialog.serverStatus.error")
                    : $t("home.dialog.serverStatus.stopped")
              }}
            </el-tag>
          </div>
          <div class="grid grid-cols-1 gap-2 mt-3 text-sm text-slate-600 md:grid-cols-2">
            <div>{{ $t("home.dialog.serverStatus.webPort") }}: {{ item.webServerPort || "-" }}</div>
            <div>{{ $t("home.dialog.serverStatus.pid") }}: {{ item.pid || "-" }}</div>
            <div class="md:col-span-2">
              {{ $t("home.dialog.serverStatus.message") }}:
              <span class="font-medium text-slate-900">
                {{ item.connectionError || item.message || "-" }}
              </span>
            </div>
          </div>
          <div class="flex justify-end mt-3">
            <el-button text type="primary" @click="openServerLog(item.serverId)">
              {{ $t("home.button.viewLog") }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes transform-opacity {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 0.3;
  }
}

$offset: 10px;

.animation-rotate-1 {
  animation: rotate 5s linear infinite;
}

.animation-rotate-2 {
  animation: rotate 4s linear infinite;
}

.animation-rotate-3 {
  animation: rotate 6s linear infinite;
}

.top-circle {
  position: absolute;
  bottom: $offset;
  transform-origin: center calc(50% - $offset);
}

.left-circle {
  position: absolute;
  left: $offset;
  top: $offset;
  transform-origin: calc(50% + $offset) center;
}

.right-circle {
  position: absolute;
  right: $offset;
  top: $offset;
  transform-origin: calc(50% - $offset) center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
