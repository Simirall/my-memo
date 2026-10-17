try {
 sessionStorage.setItem("my-memo.pending-share", document.getElementById("pending-share").dataset.share);
 window.location.replace("/share/consume");
} catch {
 document.getElementById("share-status").textContent = "共有内容を保存できませんでした。ブラウザーのストレージ設定を確認し、もう一度共有してください。";
}
