"""First-order radio model (Heinzelman et al., 2000)."""
E_ELEC = 50e-9     # J/bit spent by transmitter/receiver electronics
EPS_AMP = 100e-12  # J/bit/m^2 spent by the transmit amplifier


def tx_energy(bits, distance):
    return bits * (E_ELEC + EPS_AMP * distance ** 2)


def rx_energy(bits):
    return bits * E_ELEC
