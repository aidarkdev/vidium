#!/usr/bin/env bash
set -uo pipefail

export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
STATUS=0

row() {
  printf '%s\t%s\t%s\n' "$1" "$2" "$3"
}

required_missing() {
  row "$1" "missing" "status=missing"
  STATUS=1
}

package_row() {
  local component="$1"
  local package="$2"
  local role="$3"
  local required="$4"
  local package_status
  local package_version

  package_status="$(dpkg-query -W -f='${Status}\t${Version}\n' "${package}" 2>/dev/null)" || package_status=
  if [[ "${package_status}" == $'install ok installed\t'* ]]; then
    package_version="${package_status##*$'\t'}"
    row "${component}" "${package_version}" "status=ok;role=${role};package=${package}"
    return
  fi

  row "${component}" "missing" "status=missing;role=${role};package=${package}"
  if [ "${required}" = "required" ]; then
    STATUS=1
  fi
}

row "component" "version" "detail/status"

inventory_time="$(date -u +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null)" || inventory_time=
if [ -n "${inventory_time}" ]; then
  row "inventory_utc" "${inventory_time}" "status=ok"
else
  required_missing "inventory_utc"
fi

ubuntu_id=
ubuntu_version=
ubuntu_name=
if [ -r /etc/os-release ]; then
  while IFS='=' read -r key value; do
    value="${value#\"}"
    value="${value%\"}"
    case "${key}" in
      ID) ubuntu_id="${value}" ;;
      VERSION_ID) ubuntu_version="${value}" ;;
      PRETTY_NAME) ubuntu_name="${value}" ;;
    esac
  done < /etc/os-release
fi

if [ "${ubuntu_id}" = "ubuntu" ] && [ -n "${ubuntu_version}" ]; then
  row "ubuntu" "${ubuntu_version}" "status=ok;name=${ubuntu_name}"
elif [ -n "${ubuntu_version}" ]; then
  row "ubuntu" "${ubuntu_version}" "status=unsupported;id=${ubuntu_id:-unknown};name=${ubuntu_name:-unknown}"
  STATUS=1
else
  required_missing "ubuntu"
fi

kernel_version="$(uname -r 2>/dev/null)" || kernel_version=
if [ -n "${kernel_version}" ]; then
  row "kernel" "${kernel_version}" "status=ok"
else
  required_missing "kernel"
fi

architecture="$(uname -m 2>/dev/null)" || architecture=
if [ "${architecture}" = "x86_64" ]; then
  row "architecture" "${architecture}" "status=supported"
elif [ -n "${architecture}" ]; then
  row "architecture" "${architecture}" "status=unsupported"
  STATUS=1
else
  required_missing "architecture"
fi

node_link="${PROJECT_ROOT}/runtime/node"
node_binary="${node_link}/bin/node"
node_target="$(readlink -f "${node_link}" 2>/dev/null)" || node_target=
case "${node_target}" in
  "${PROJECT_ROOT}/"*) node_target="${node_target#"${PROJECT_ROOT}/"}" ;;
esac

node_version=
if [ -x "${node_binary}" ]; then
  node_version="$("${node_binary}" --version 2>/dev/null)" || node_version=
fi
if [ -n "${node_version}" ] && [ -n "${node_target}" ]; then
  row "node" "${node_version}" "status=ok;target=${node_target}"
else
  row "node" "missing" "status=missing;target=${node_target:-missing}"
  STATUS=1
fi

ytdlp_binary="$(command -v yt-dlp 2>/dev/null)" || ytdlp_binary=
ytdlp_version=
ytdlp_sha256=
if [ -n "${ytdlp_binary}" ] && [ -x "${ytdlp_binary}" ]; then
  ytdlp_version="$("${ytdlp_binary}" --version 2>/dev/null)" || ytdlp_version=
  ytdlp_sha256="$(sha256sum "${ytdlp_binary}" 2>/dev/null)" || ytdlp_sha256=
  ytdlp_sha256="${ytdlp_sha256%% *}"
fi
if [ -n "${ytdlp_version}" ] && [ -n "${ytdlp_sha256}" ]; then
  row "yt-dlp" "${ytdlp_version}" "status=ok;sha256=${ytdlp_sha256};path=${ytdlp_binary}"
else
  row "yt-dlp" "${ytdlp_version:-missing}" "status=missing;sha256=${ytdlp_sha256:-missing};path=${ytdlp_binary:-missing}"
  STATUS=1
fi

package_row "curl" "curl" "optional-runtime-proxy-check" "optional"
package_row "git" "git" "deployment-only" "optional"
package_row "nginx" "nginx" "runtime" "required"
package_row "certbot" "certbot" "certificate-management" "required"
package_row "python3-certbot-nginx" "python3-certbot-nginx" "certificate-management" "required"
package_row "systemd" "systemd" "runtime" "required"

exit "${STATUS}"
