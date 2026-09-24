// What a scan found. One sheet serves three jobs: a price check (price and
// stock, nothing touched), a code nobody has saved yet, and the chance to put
// the item straight on the sale or invoice it was scanned from.
import { View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

import { Av, Badge, Btn, Card, Divider, H4, Lbl, Li, Money, Row, Sub, Tag } from "@/src/components/ui";
import { Photo } from "@/src/components/photo";
import { Sheet } from "@/src/components/sheet";
import { money } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  photo: { width: 64, height: 64, borderRadius: 13, backgroundColor: c.sqAv },
  priceWell: { backgroundColor: c.brandTertiary, borderColor: c.mint2, marginTop: 10, paddingVertical: 11 },
}));

export function ScanResultSheet({ code, item, onClose, onScanAgain, onCreate, onAdd, addLabel, testID = "scan-result" }: {
  /** The scanned (or typed) code. Empty means the sheet is closed. */
  code: string;
  /** The item that carries the code, or null when nothing matched. */
  item: any | null;
  onClose: () => void;
  onScanAgain?: () => void;
  onCreate?: (code: string) => void;
  onAdd?: (item: any) => void;
  addLabel?: string;
  testID?: string;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const out = !!item && item.track_stock && item.quantity <= 0;
  const low = !!item && item.track_stock && !out && item.quantity <= (item.alert_below ?? 0);
  const rows: any[] = item?.stock_by_shop ?? [];

  return (
    <Sheet visible={!!code} onClose={onClose} testID={`${testID}-sheet`}>
      {!item ? (
        <>
          <H4>No item with that code</H4>
          <Sub style={{ marginTop: 3 }}>Nothing in your stock carries this bar code yet.</Sub>
          <Card style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Av icon="barcode-outline" tone="sq" />
            <View style={{ flex: 1 }}><Lbl>Scanned code</Lbl><Money size={13} testID={`${testID}-code`}>{code}</Money></View>
          </Card>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Btn small variant="ghost" label="Scan again" onPress={onScanAgain ?? onClose} testID={`${testID}-retry`} /></View>
            <View style={{ flex: 1.4 }}>
              <Btn small label="Create this item" testID={`${testID}-create`}
                onPress={() => (onCreate ? onCreate(code) : router.push({ pathname: "/stock/new", params: { barcode: code } }))} />
            </View>
          </View>
        </>
      ) : (
        <>
          <Row style={{ gap: 11, alignItems: "flex-start" }}>
            {item.photo_url ? <Photo url={item.photo_url} style={s.photo} testID={`${testID}-photo`} /> : <Av icon="cube-outline" tone="sq" size={64} radiusOverride={13} />}
            <View style={{ flex: 1 }}>
              <H4 style={{ fontSize: 15 }}>{item.name}</H4>
              <Sub style={{ marginTop: 2 }}>{[item.brand, item.category, item.unit].filter(Boolean).join(" · ")}</Sub>
              <Row style={{ gap: 6, marginTop: 6 }}>
                {out ? <Badge tone="over">Out of stock</Badge> : low ? <Badge tone="due">{item.quantity} left</Badge> : <Badge tone="paid">In stock</Badge>}
                {item.barcode ? <Tag>{item.barcode}</Tag> : null}
              </Row>
            </View>
          </Row>

          <Card style={s.priceWell} testID={`${testID}-price`}>
            <Row between>
              <View>
                <Lbl>Selling price</Lbl>
                <Money size={22}>{money(item.selling_price)}</Money>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Lbl>{item.track_stock ? "On hand" : "Not tracked"}</Lbl>
                <Money size={16} tone={out ? "neg" : low ? undefined : "pos"} testID={`${testID}-stock`}>
                  {item.track_stock ? `${item.quantity} ${item.unit ?? ""}`.trim() : "—"}
                </Money>
              </View>
            </Row>
            {item.wholesale_price ? (
              <>
                <Divider />
                <Row between><Sub>Wholesale price</Sub><Money size={12.5}>{money(item.wholesale_price)}</Money></Row>
              </>
            ) : null}
          </Card>

          {rows.length > 1 ? (
            <Card style={{ marginTop: 9, paddingVertical: 2 }} testID={`${testID}-shops`}>
              {rows.map((r, i) => (
                <Li key={r.shop} last={i === rows.length - 1}>
                  <Av icon="storefront-outline" tone="sq" size={26} />
                  <H4 style={{ flex: 1, fontSize: 12.5 }}>{r.shop}</H4>
                  <Money size={12}>{r.qty}</Money>
                </Li>
              ))}
            </Card>
          ) : null}

          <Card style={{ marginTop: 9, paddingVertical: 9 }}>
            <Row style={{ gap: 7, alignItems: "flex-start" }}>
              <Ionicons name="pricetag-outline" size={14} color={colors.ink40} />
              <Sub style={{ flex: 1 }}>Nothing was added to a sale — this is a price check. Your stock is untouched.</Sub>
            </Row>
          </Card>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}><Btn small variant="ghost" label="Scan next" onPress={onScanAgain ?? onClose} testID={`${testID}-retry`} /></View>
            {onAdd ? (
              <View style={{ flex: 1.3 }}><Btn small label={addLabel ?? "Add to sale"} icon="add" onPress={() => onAdd(item)} testID={`${testID}-add`} /></View>
            ) : (
              <View style={{ flex: 1.3 }}><Btn small label="Open item" onPress={() => { onClose(); router.push(`/stock/${item.id}`); }} testID={`${testID}-open`} /></View>
            )}
          </View>
          {onAdd ? (
            <Btn small variant="ghost" label="Open item card" style={{ marginTop: 8 }} testID={`${testID}-open`}
              onPress={() => { onClose(); router.push(`/stock/${item.id}`); }} />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
