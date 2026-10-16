from sklearn.preprocessing import LabelEncoder


def encode_categorical(df):
    """Label-encode every non-numeric feature column in place (protocol_type, service, flag, ...)."""
    for col in df.select_dtypes(exclude="number").columns:
        df[col] = LabelEncoder().fit_transform(df[col])
    return df
